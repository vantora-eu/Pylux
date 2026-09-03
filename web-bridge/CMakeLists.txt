cmake_minimum_required(VERSION 3.21)

include(FetchContent)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
set(NO_TESTS ON CACHE BOOL "" FORCE)
set(NO_WEBSOCKET OFF CACHE BOOL "" FORCE)
set(NO_MEDIA OFF CACHE BOOL "" FORCE)
set(WARNINGS_AS_ERRORS OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  libdatachannel
  GIT_REPOSITORY https://github.com/paullouisageneau/libdatachannel.git
  GIT_TAG c6696d157b5612df2a741d9a03b192b47ab6cefb # v0.24.3
  GIT_SHALLOW TRUE
  GIT_SUBMODULES_RECURSE TRUE
)

FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
)

FetchContent_MakeAvailable(libdatachannel nlohmann_json)

add_executable(pylux-web-bridge src/main.cpp)
target_compile_features(pylux-web-bridge PRIVATE cxx_std_17)
target_link_libraries(pylux-web-bridge PRIVATE Chiaki::lib datachannel-static nlohmann_json::nlohmann_json)

if(APPLE)
  target_link_libraries(pylux-web-bridge PRIVATE "-framework Security")
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(pylux-web-bridge PRIVATE -Wall -Wextra -Wpedantic)
endif()

install(TARGETS pylux-web-bridge RUNTIME DESTINATION bin)
