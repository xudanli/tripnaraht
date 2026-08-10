import {
  XHS_FORBIDDEN_TOOLS,
  XiaohongshuDirectService,
} from './xiaohongshu-direct.service';

describe('XiaohongshuDirectService', () => {
  it('rejects write tools', async () => {
    const svc = new XiaohongshuDirectService();
    for (const name of XHS_FORBIDDEN_TOOLS) {
      await expect(svc.callReadonlyTool(name, {})).rejects.toThrow(/写操作已禁用/);
    }
  });

  it('rejects unknown tools', async () => {
    const svc = new XiaohongshuDirectService();
    await expect(svc.callReadonlyTool('hack_everything', {})).rejects.toThrow(
      /未开放/,
    );
  });

  it('searchFeeds requires keyword', async () => {
    const svc = new XiaohongshuDirectService();
    const r = await svc.searchFeeds({ keyword: '  ' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/keyword/);
  });
});
