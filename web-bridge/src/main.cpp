#include <chiaki/audioreceiver.h>
#include <chiaki/base64.h>
#include <chiaki/controller.h>
#include <chiaki/log.h>
#include <chiaki/session.h>

#include <rtc/rtc.hpp>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using json = nlohmann::json;
using namespace std::chrono;

namespace {

std::atomic<bool> interrupted{false};

void signal_handler(int) { interrupted = true; }

std::string required_env(const char *name)
{
	const char *value = std::getenv(name);
	if(!value || !*value)
		throw std::runtime_error(std::string("Missing required environment variable: ") + name);
	return value;
}

std::string optional_env(const char *name, const char *fallback)
{
	const char *value = std::getenv(name);
	return value && *value ? value : fallback;
}

bool secure_equals(const std::string &left, const std::string &right)
{
	const size_t size = std::max(left.size(), right.size());
	unsigned char difference = static_cast<unsigned char>(left.size() ^ right.size());
	for(size_t i = 0; i < size; ++i)
	{
		const unsigned char a = i < left.size() ? static_cast<unsigned char>(left[i]) : 0;
		const unsigned char b = i < right.size() ? static_cast<unsigned char>(right[i]) : 0;
		difference |= static_cast<unsigned char>(a ^ b);
	}
	return difference == 0;
}

std::vector<std::string> split_csv(const std::string &value)
{
	std::vector<std::string> result;
	size_t start = 0;
	while(start < value.size())
	{
		size_t end = value.find(',', start);
		if(end == std::string::npos)
			end = value.size();
		std::string item = value.substr(start, end - start);
		item.erase(0, item.find_first_not_of(" \t"));
		item.erase(item.find_last_not_of(" \t") + 1);
		if(!item.empty())
			result.push_back(std::move(item));
		start = end + 1;
	}
	return result;
}

bool contains_h264_nal(const uint8_t *data, size_t size, uint8_t wanted_type)
{
	for(size_t i = 0; i + 4 < size; ++i)
	{
		size_t header = 0;
		if(data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1)
			header = i + 3;
		else if(i + 4 < size && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1)
			header = i + 4;
		if(header && header < size && (data[header] & 0x1f) == wanted_type)
			return true;
	}
	return false;
}

int16_t clamp_axis(int value)
{
	return static_cast<int16_t>(std::max(-32768, std::min(32767, value)));
}

uint8_t clamp_trigger(int value)
{
	return static_cast<uint8_t>(std::max(0, std::min(255, value)));
}

struct BridgeConfig
{
	std::string ps_host;
	std::string regist_key;
	uint8_t morning[16]{};
	std::string pair_code;
	std::string bind_address;
	uint16_t port = 8080;
	std::string tls_cert;
	std::string tls_key;
	std::vector<std::string> ice_servers;

	static BridgeConfig load()
	{
		BridgeConfig config;
		config.ps_host = required_env("PYLUX_PS_HOST");
		config.regist_key = required_env("PYLUX_REGIST_KEY");
		config.pair_code = required_env("PYLUX_PAIR_CODE");
		config.bind_address = optional_env("PYLUX_BRIDGE_BIND", "127.0.0.1");
		config.port = static_cast<uint16_t>(std::stoul(optional_env("PYLUX_BRIDGE_PORT", "8080")));
		config.tls_cert = optional_env("PYLUX_TLS_CERT", "");
		config.tls_key = optional_env("PYLUX_TLS_KEY", "");
		config.ice_servers = split_csv(optional_env("PYLUX_ICE_SERVERS", ""));

		if(config.regist_key.size() != CHIAKI_SESSION_AUTH_SIZE)
			throw std::runtime_error("PYLUX_REGIST_KEY must contain exactly 16 characters");
		if(config.pair_code.size() < 6)
			throw std::runtime_error("PYLUX_PAIR_CODE must contain at least 6 characters");
		if(config.port == 0)
			throw std::runtime_error("PYLUX_BRIDGE_PORT must be between 1 and 65535");
		if(config.tls_cert.empty() != config.tls_key.empty())
			throw std::runtime_error("PYLUX_TLS_CERT and PYLUX_TLS_KEY must be configured together");

		const std::string morning = required_env("PYLUX_MORNING_BASE64");
		size_t morning_size = sizeof(config.morning);
		if(chiaki_base64_decode(morning.c_str(), morning.size(), config.morning, &morning_size) != CHIAKI_ERR_SUCCESS || morning_size != sizeof(config.morning))
			throw std::runtime_error("PYLUX_MORNING_BASE64 must decode to exactly 16 bytes");
		return config;
	}
};

class WebBridge
{
public:
	explicit WebBridge(BridgeConfig config) : config_(std::move(config))
	{
		chiaki_log_init(&log_, CHIAKI_LOG_ALL & ~CHIAKI_LOG_VERBOSE, chiaki_log_cb_print, nullptr);
		rtc::InitLogger(rtc::LogLevel::Warning);

		rtc::WebSocketServer::Configuration server_config;
		server_config.port = config_.port;
		server_config.bindAddress = config_.bind_address;
		server_config.maxMessageSize = 256 * 1024;
		if(!config_.tls_cert.empty())
		{
			server_config.enableTls = true;
			server_config.certificatePemFile = config_.tls_cert;
			server_config.keyPemFile = config_.tls_key;
		}

		server_ = std::make_unique<rtc::WebSocketServer>(server_config);
		server_->onClient([this](std::shared_ptr<rtc::WebSocket> socket) { accept_client(std::move(socket)); });
		std::cout << "Pylux WebRTC bridge listening on "
		          << (server_config.enableTls ? "wss://" : "ws://")
		          << config_.bind_address << ':' << server_->port() << std::endl;
	}

	~WebBridge() { shutdown(); }

	void shutdown()
	{
		stop_chiaki();
		std::shared_ptr<rtc::WebSocket> socket;
		std::shared_ptr<rtc::PeerConnection> peer;
		{
			std::lock_guard<std::mutex> lock(client_mutex_);
			socket = std::move(socket_);
			peer = std::move(peer_);
			video_track_.reset();
			audio_track_.reset();
			input_channel_.reset();
		}
		// Closing either object can synchronously invoke a callback. Never do
		// that while holding client_mutex_, or shutdown can deadlock itself.
		if(socket)
			socket->close();
		if(peer)
			peer->close();
		if(server_)
			server_->stop();
	}

private:
	void accept_client(std::shared_ptr<rtc::WebSocket> socket)
	{
		{
			std::lock_guard<std::mutex> lock(client_mutex_);
			if(socket_ && socket_->isOpen())
			{
				socket->send(json{{"type", "error"}, {"message", "Another browser session is active"}}.dump());
				socket->close();
				return;
			}
			socket_ = socket;
		}

		std::cout << "Browser connected from " << socket->remoteAddress().value_or("unknown") << std::endl;
		socket->onMessage(nullptr, [this, weak = std::weak_ptr<rtc::WebSocket>(socket)](std::string message) {
			if(auto current = weak.lock())
				handle_signaling(current, message);
		});
		socket->onClosed([this, weak = std::weak_ptr<rtc::WebSocket>(socket)] {
			auto current = weak.lock();
			if(!current)
				return;
			std::shared_ptr<rtc::PeerConnection> peer;
			{
				std::lock_guard<std::mutex> lock(client_mutex_);
				if(socket_ != current)
					return;
				socket_.reset();
				peer = std::move(peer_);
				video_track_.reset();
				audio_track_.reset();
				input_channel_.reset();
			}
			if(peer)
			{
				peer->close();
			}
			std::cout << "Browser disconnected; stopping Remote Play" << std::endl;
			stop_chiaki();
		});
	}

	void handle_signaling(const std::shared_ptr<rtc::WebSocket> &socket, const std::string &raw)
	{
		try
		{
			const json message = json::parse(raw);
			const std::string type = message.value("type", "");
			if(type == "start")
			{
				if(!secure_equals(message.value("pairCode", ""), config_.pair_code))
				{
					socket->send(json{{"type", "error"}, {"message", "Invalid pairing code"}}.dump());
					socket->close();
					return;
				}
				create_peer(socket);
			}
			else if(type == "answer" && peer_)
			{
				const auto sdp = message.at("sdp");
				peer_->setRemoteDescription(rtc::Description(sdp.at("sdp").get<std::string>(), "answer"));
			}
			else if(type == "ice" && peer_)
			{
				const auto candidate = message.at("candidate");
				peer_->addRemoteCandidate(rtc::Candidate(
					candidate.at("candidate").get<std::string>(),
					candidate.value("sdpMid", "0")));
			}
			else if(type == "stop")
			{
				stop_chiaki();
				send_signal(json{{"type", "state"}, {"state", "idle"}});
			}
		}
		catch(const std::exception &error)
		{
			socket->send(json{{"type", "error"}, {"message", std::string("Invalid signaling message: ") + error.what()}}.dump());
		}
	}

	void create_peer(const std::shared_ptr<rtc::WebSocket> &socket)
	{
		std::lock_guard<std::mutex> lock(client_mutex_);
		if(peer_)
			return;

		rtc::Configuration peer_config;
		for(const std::string &server : config_.ice_servers)
			peer_config.iceServers.emplace_back(server);
		peer_ = std::make_shared<rtc::PeerConnection>(peer_config);

		peer_->onLocalDescription([weak = std::weak_ptr<rtc::WebSocket>(socket)](rtc::Description description) {
			if(auto ws = weak.lock())
				ws->send(json{{"type", description.typeString()}, {"sdp", {{"type", description.typeString()}, {"sdp", std::string(description)}}}}.dump());
		});
		peer_->onLocalCandidate([weak = std::weak_ptr<rtc::WebSocket>(socket)](rtc::Candidate candidate) {
			if(auto ws = weak.lock())
				ws->send(json{{"type", "ice"}, {"candidate", {{"candidate", std::string(candidate)}, {"sdpMid", candidate.mid()}}}}.dump());
		});
		peer_->onStateChange([this](rtc::PeerConnection::State state) {
			if(state == rtc::PeerConnection::State::Connected)
			{
				send_signal(json{{"type", "state"}, {"state", "connecting"}});
				start_chiaki();
			}
			else if(state == rtc::PeerConnection::State::Failed || state == rtc::PeerConnection::State::Closed)
			{
				stop_chiaki();
			}
		});

		constexpr uint8_t video_payload_type = 102;
		constexpr uint8_t audio_payload_type = 111;
		constexpr uint32_t video_ssrc = 42;
		constexpr uint32_t audio_ssrc = 43;
		const std::string msid = "pylux-stream";

		rtc::Description::Video video("video", rtc::Description::Direction::SendOnly);
		video.addH264Codec(video_payload_type);
		video.addSSRC(video_ssrc, "pylux-video", msid, "video");
		video_track_ = peer_->addTrack(video);
		auto video_rtp = std::make_shared<rtc::RtpPacketizationConfig>(video_ssrc, "pylux-video", video_payload_type, rtc::H264RtpPacketizer::ClockRate);
		auto video_packetizer = std::make_shared<rtc::H264RtpPacketizer>(rtc::NalUnit::Separator::StartSequence, video_rtp);
		video_packetizer->addToChain(std::make_shared<rtc::RtcpSrReporter>(video_rtp));
		video_packetizer->addToChain(std::make_shared<rtc::RtcpNackResponder>());
		video_track_->setMediaHandler(video_packetizer);

		rtc::Description::Audio audio("audio", rtc::Description::Direction::SendOnly);
		audio.addOpusCodec(audio_payload_type);
		audio.addSSRC(audio_ssrc, "pylux-audio", msid, "audio");
		audio_track_ = peer_->addTrack(audio);
		auto audio_rtp = std::make_shared<rtc::RtpPacketizationConfig>(audio_ssrc, "pylux-audio", audio_payload_type, rtc::OpusRtpPacketizer::DefaultClockRate);
		auto audio_packetizer = std::make_shared<rtc::OpusRtpPacketizer>(audio_rtp);
		audio_packetizer->addToChain(std::make_shared<rtc::RtcpSrReporter>(audio_rtp));
		audio_packetizer->addToChain(std::make_shared<rtc::RtcpNackResponder>());
		audio_track_->setMediaHandler(audio_packetizer);

		rtc::DataChannelInit input_init;
		input_init.reliability.unordered = true;
		input_init.reliability.maxRetransmits = 0;
		input_channel_ = peer_->createDataChannel("pylux-input", input_init);
		input_channel_->onMessage(nullptr, [this](std::string message) { handle_input(message); });

		media_epoch_ = steady_clock::now();
		peer_->setLocalDescription(rtc::Description::Type::Offer);
	}

	void start_chiaki()
	{
		std::lock_guard<std::mutex> lock(session_mutex_);
		if(session_)
			return;

		auto session = std::make_unique<ChiakiSession>();
		ChiakiConnectInfo info{};
		info.ps5 = true;
		info.host = config_.ps_host.c_str();
		std::memcpy(info.regist_key, config_.regist_key.data(), CHIAKI_SESSION_AUTH_SIZE);
		std::memcpy(info.morning, config_.morning, sizeof(info.morning));
		chiaki_connect_video_profile_preset(&info.video_profile, CHIAKI_VIDEO_RESOLUTION_PRESET_1080p, CHIAKI_VIDEO_FPS_PRESET_60);
		info.video_profile.codec = CHIAKI_CODEC_H264;
		info.video_profile_auto_downgrade = true;
		info.enable_dualsense = false;
		info.service_type = CHIAKI_SERVICE_TYPE_REMOTE_PLAY;

		ChiakiErrorCode error = chiaki_session_init(session.get(), &info, &log_);
		if(error != CHIAKI_ERR_SUCCESS)
		{
			send_signal(json{{"type", "error"}, {"message", std::string("Pylux session initialization failed: ") + chiaki_error_string(error)}});
			return;
		}

		chiaki_session_set_event_cb(session.get(), &WebBridge::event_callback, this);
		chiaki_session_set_video_sample_cb(session.get(), &WebBridge::video_callback, this);
		ChiakiAudioSink sink{};
		sink.user = this;
		sink.header_cb = &WebBridge::audio_header_callback;
		sink.frame_cb = &WebBridge::audio_frame_callback;
		chiaki_session_set_audio_sink(session.get(), &sink);
		chiaki_session_set_ps_chord(session.get(), true, 0);

		error = chiaki_session_start(session.get());
		if(error != CHIAKI_ERR_SUCCESS)
		{
			chiaki_session_fini(session.get());
			send_signal(json{{"type", "error"}, {"message", std::string("Pylux session start failed: ") + chiaki_error_string(error)}});
			return;
		}
		session_ = std::move(session);
	}

	void stop_chiaki()
	{
		std::unique_ptr<ChiakiSession> session;
		{
			std::lock_guard<std::mutex> lock(session_mutex_);
			session = std::move(session_);
		}
		if(session)
		{
			chiaki_session_stop(session.get());
			chiaki_session_join(session.get());
			chiaki_session_fini(session.get());
		}
		std::lock_guard<std::mutex> media_lock(media_mutex_);
		video_header_.clear();
	}

	void handle_input(const std::string &raw)
	{
		try
		{
			const json value = json::parse(raw);
			ChiakiControllerState state{};
			chiaki_controller_state_set_idle(&state);
			state.buttons = value.value("b", 0u);
			state.left_x = clamp_axis(value.value("lx", 0));
			state.left_y = clamp_axis(value.value("ly", 0));
			state.right_x = clamp_axis(value.value("rx", 0));
			state.right_y = clamp_axis(value.value("ry", 0));
			state.l2_state = clamp_trigger(value.value("l2", 0));
			state.r2_state = clamp_trigger(value.value("r2", 0));

			std::lock_guard<std::mutex> lock(session_mutex_);
			if(session_)
				chiaki_session_set_controller_state(session_.get(), &state);
		}
		catch(const std::exception &error)
		{
			std::cerr << "Ignoring invalid controller state: " << error.what() << std::endl;
		}
	}

	void send_signal(const json &message)
	{
		std::shared_ptr<rtc::WebSocket> socket;
		{
			std::lock_guard<std::mutex> lock(client_mutex_);
			socket = socket_;
		}
		if(socket && socket->isOpen())
			socket->send(message.dump());
	}

	void send_video(uint8_t *data, size_t size)
	{
		std::shared_ptr<rtc::Track> track;
		std::vector<uint8_t> sample;
		{
			std::lock_guard<std::mutex> lock(media_mutex_);
			track = video_track_;
			const bool has_parameter_set = contains_h264_nal(data, size, 7) || contains_h264_nal(data, size, 8);
			const bool has_slice = contains_h264_nal(data, size, 1) || contains_h264_nal(data, size, 5);
			if(has_parameter_set && !has_slice)
			{
				video_header_.assign(data, data + size);
				return;
			}
			if(contains_h264_nal(data, size, 5) && !video_header_.empty())
			{
				sample = video_header_;
				sample.insert(sample.end(), data, data + size);
			}
			else
			{
				sample.assign(data, data + size);
			}
		}
		if(track && track->isOpen())
		{
			const auto elapsed = duration_cast<microseconds>(steady_clock::now() - media_epoch_);
			track->sendFrame(reinterpret_cast<const rtc::byte *>(sample.data()), sample.size(), rtc::FrameInfo(duration<double, std::micro>(elapsed.count())));
		}
	}

	void send_audio(uint8_t *data, size_t size)
	{
		std::shared_ptr<rtc::Track> track;
		{
			std::lock_guard<std::mutex> lock(media_mutex_);
			track = audio_track_;
		}
		if(track && track->isOpen())
		{
			const auto elapsed = duration_cast<microseconds>(steady_clock::now() - media_epoch_);
			track->sendFrame(reinterpret_cast<const rtc::byte *>(data), size, rtc::FrameInfo(duration<double, std::micro>(elapsed.count())));
		}
	}

	static void event_callback(ChiakiEvent *event, void *user)
	{
		auto *bridge = static_cast<WebBridge *>(user);
		if(event->type == CHIAKI_EVENT_CONNECTED)
			bridge->send_signal(json{{"type", "state"}, {"state", "streaming"}});
		else if(event->type == CHIAKI_EVENT_LOGIN_PIN_REQUEST)
			bridge->send_signal(json{{"type", "error"}, {"message", "The console requested a login PIN; enter it once in the native Pylux app"}});
		else if(event->type == CHIAKI_EVENT_QUIT)
			bridge->send_signal(json{{"type", "error"}, {"message", std::string("Remote Play ended: ") + chiaki_quit_reason_string(event->quit.reason)}});
	}

	static bool video_callback(uint8_t *data, size_t size, int32_t, bool, void *user)
	{
		static_cast<WebBridge *>(user)->send_video(data, size);
		return true;
	}

	static void audio_header_callback(ChiakiAudioHeader *header, void *user)
	{
		auto *bridge = static_cast<WebBridge *>(user);
		if(header->rate != 48000 || header->channels != 2)
			bridge->send_signal(json{{"type", "error"}, {"message", "Unsupported audio format; WebRTC requires 48 kHz stereo Opus"}});
	}

	static void audio_frame_callback(uint8_t *data, size_t size, void *user)
	{
		static_cast<WebBridge *>(user)->send_audio(data, size);
	}

	BridgeConfig config_;
	ChiakiLog log_{};
	std::unique_ptr<rtc::WebSocketServer> server_;
	std::shared_ptr<rtc::WebSocket> socket_;
	std::shared_ptr<rtc::PeerConnection> peer_;
	std::shared_ptr<rtc::Track> video_track_;
	std::shared_ptr<rtc::Track> audio_track_;
	std::shared_ptr<rtc::DataChannel> input_channel_;
	std::unique_ptr<ChiakiSession> session_;
	std::vector<uint8_t> video_header_;
	steady_clock::time_point media_epoch_ = steady_clock::now();
	std::mutex client_mutex_;
	std::mutex session_mutex_;
	std::mutex media_mutex_;
};

} // namespace

int main()
{
	try
	{
		std::signal(SIGINT, signal_handler);
		std::signal(SIGTERM, signal_handler);
		WebBridge bridge(BridgeConfig::load());
		while(!interrupted)
			std::this_thread::sleep_for(milliseconds(100));
		bridge.shutdown();
		return 0;
	}
	catch(const std::exception &error)
	{
		std::cerr << "Pylux WebRTC bridge failed: " << error.what() << std::endl;
		return 1;
	}
}
