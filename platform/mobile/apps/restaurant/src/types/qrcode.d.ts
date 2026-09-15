declare module 'qrcode' {
  type SvgOptions = {
    type: 'svg';
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    color?: { dark?: string; light?: string };
    width?: number;
  };

  const QRCode: {
    toString(value: string, options: SvgOptions): Promise<string>;
  };

  export default QRCode;
}
