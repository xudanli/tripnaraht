import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MobileCredentialDocumentsService } from './mobile-credential-documents.service';

describe('MobileCredentialDocumentsService', () => {
  function build() {
    const prisma = {
      userCredentialDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'doc_1',
            type: 'drivers_license',
            status: 'verified',
            expiresOn: new Date('2028-06-20T00:00:00Z'),
            numberLast4: '1234',
            updatedAt: new Date('2026-07-01T00:00:00Z'),
            storageKey: 'user-credentials/u1/a.pdf',
          },
        ]),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'doc_new',
          notes: data.notes,
          mimeType: data.mimeType,
          fileName: data.fileName,
          numberLast4: null,
          storageKey: data.storageKey,
          fileUrl: data.fileUrl,
          updatedAt: new Date(),
          expiresOn: data.expiresOn,
          type: data.type,
          status: data.status,
        })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = {
      save: jest.fn().mockResolvedValue({
        storageKey: 'user-credentials/u1/x.pdf',
        fileUrl: null,
        fileSizeBytes: 100,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      signDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://signed.example/x?sig=1',
        expiresAt: '2026-07-21T00:10:00.000Z',
      }),
    };
    const svc = new MobileCredentialDocumentsService(prisma as never, storage as never);
    return { svc, prisma, storage };
  }

  it('lists metadata without signed URLs', async () => {
    const { svc } = build();
    const res = await svc.listDocuments('5872f534-4fdf-483d-9e5a-464d3f36935d');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.id).toBe('doc_1');
    expect(res.items[0]?.numberLast4).toBe('1234');
    expect((res.items[0] as { signedUrl?: string }).signedUrl).toBeUndefined();
  });

  it('returns empty list for non-uuid soft-auth users', async () => {
    const { svc, prisma } = build();
    const res = await svc.listDocuments('anonymous-dev-user');
    expect(res.items).toEqual([]);
    expect(prisma.userCredentialDocument.findMany).not.toHaveBeenCalled();
  });

  it('rejects unknown type / oversized / bad mime', async () => {
    const { svc } = build();
    await expect(
      svc.uploadDocument('u1', { type: 'unknown', file: fakeFile() }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.uploadDocument('u1', {
        type: 'passport',
        file: fakeFile({ size: 11 * 1024 * 1024 }),
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    await expect(
      svc.uploadDocument('u1', {
        type: 'passport',
        file: fakeFile({ mimetype: 'text/plain' }),
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('upload returns pending detail with signed URL', async () => {
    const { svc, storage } = build();
    const res = await svc.uploadDocument('u1', {
      type: 'passport',
      expiresOn: '2030-01-01',
      notes: 'mine',
      file: fakeFile(),
    });
    expect(storage.save).toHaveBeenCalled();
    expect(res.status).toBe('pending');
    expect(res.signedUrl).toContain('signed.example');
    expect(res.notes).toBe('mine');
  });

  it('getDocument only for owner row', async () => {
    const { svc, prisma, storage } = build();
    prisma.userCredentialDocument.findFirst.mockResolvedValue({
      id: 'doc_1',
      type: 'passport',
      status: 'pending',
      expiresOn: null,
      notes: null,
      mimeType: 'application/pdf',
      fileName: 'p.pdf',
      numberLast4: null,
      storageKey: 'k',
      fileUrl: null,
      updatedAt: new Date(),
    });
    const detail = await svc.getDocument('u1', 'doc_1');
    expect(storage.signDownloadUrl).toHaveBeenCalled();
    expect(detail.signedUrl).toBeTruthy();
  });
});

function fakeFile(partial?: Partial<Express.Multer.File>): Express.Multer.File {
  const size = partial?.size ?? 100;
  return {
    fieldname: 'file',
    originalname: 'doc.pdf',
    encoding: '7bit',
    mimetype: partial?.mimetype ?? 'application/pdf',
    size,
    buffer: Buffer.alloc(Math.min(size, 100), 1),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}
