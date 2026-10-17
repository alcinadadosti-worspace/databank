import { detectCertificateFileType, cleanCertificateFilename } from '../../services/medical-certificates';

describe('detectCertificateFileType', () => {
  it('recognizes PDF, JPEG, PNG, WEBP and HEIC by their first bytes', () => {
    expect(detectCertificateFileType(Buffer.from('%PDF-1.7\n...'))).toEqual({ ext: 'pdf', mimetype: 'application/pdf' });
    expect(detectCertificateFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toEqual({ ext: 'jpg', mimetype: 'image/jpeg' });
    expect(detectCertificateFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])))
      .toEqual({ ext: 'png', mimetype: 'image/png' });
    expect(detectCertificateFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')])))
      .toEqual({ ext: 'webp', mimetype: 'image/webp' });
    expect(detectCertificateFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)])))
      .toEqual({ ext: 'heic', mimetype: 'image/heic' });
    expect(detectCertificateFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmif1'), Buffer.alloc(8)])))
      .toEqual({ ext: 'heic', mimetype: 'image/heic' });
  });

  it('rejects anything else, even with an image/pdf name (HTML, SVG, video, Slack login page)', () => {
    expect(detectCertificateFileType(Buffer.from('<!DOCTYPE html><html>'))).toBeNull();
    expect(detectCertificateFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectCertificateFileType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(8)]))).toBeNull();
    expect(detectCertificateFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('cleanCertificateFilename', () => {
  it('keeps the name and makes the extension match the real type', () => {
    expect(cleanCertificateFilename('atestado.pdf', 'pdf')).toBe('atestado.pdf');
    expect(cleanCertificateFilename('IMG_1234.HEIC', 'heic')).toBe('IMG_1234.HEIC');
    expect(cleanCertificateFilename('foto.png', 'jpg')).toBe('foto.jpg');
    expect(cleanCertificateFilename('scan', 'pdf')).toBe('scan.pdf');
  });

  it('drops path separators, quotes and control characters', () => {
    expect(cleanCertificateFilename('../../etc/"x"\n.pdf', 'pdf')).toBe('....etcx.pdf');
    expect(cleanCertificateFilename('', 'png')).toBe('atestado.png');
    expect(cleanCertificateFilename(null, 'pdf')).toBe('atestado.pdf');
  });
});
