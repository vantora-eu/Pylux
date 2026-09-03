declare module 'qrcode-terminal' {
  export default class QRCode {
    constructor(typeNumber: number, errorCorrectLevel: number);
    addData(value: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, column: number): boolean;
  }
}
