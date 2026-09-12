import express from 'express';
import path from 'path';
import { migrate, waitForDb } from './db';
import { router } from './routes';
import { seedAllergyDemo, seedIfEmpty } from './seed';

const PORT = Number(process.env.PORT || 3000);
const app = express();

app.use(express.json({ limit: '2mb' }));

// API 路由
app.use('/api', router);

// 前端静态资源（生产构建产物）
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
// SPA 回退
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// 统一错误处理
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

async function boot() {
  await waitForDb();
  await migrate();
  if ((process.env.SEED_DEMO || 'true') !== 'false') {
    await seedIfEmpty();
    await seedAllergyDemo();
  }
  app.listen(PORT, () => {
    console.log(`[server] 婚礼宴会厅管理系统已启动: http://0.0.0.0:${PORT}`);
  });
}

boot().catch((e) => {
  console.error('[boot] 启动失败:', e);
  process.exit(1);
});
