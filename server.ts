import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory simulation state for MikroTik Hotspot session
let sessionState = {
  isLoggedIn: false,
  username: 'USER-1234',
  speed: '256k/700k',
  updateOption: '_Uon',
  bytesIn: 14680064,
  bytesOut: 58720256,
  remainBytes: 536870912,
  startTime: Date.now(),
  ip: '192.168.88.25',
  mac: '64:6E:97:A1:B2:C3',
};

// Periodic simulated traffic increments if logged in
setInterval(() => {
  if (sessionState.isLoggedIn) {
    sessionState.bytesIn += Math.floor(Math.random() * 45000) + 5000;
    sessionState.bytesOut += Math.floor(Math.random() * 95000) + 15000;
    if (sessionState.remainBytes > 0) {
      sessionState.remainBytes = Math.max(0, sessionState.remainBytes - 120000);
    }
  }
}, 2000);

// Helper to format uptime into Arabic-friendly / Hotspot-friendly string
function getUptimeString(startTime: number): string {
  const diffSecs = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

// MikroTik Hotspot /login endpoint
app.get('/login', (req, res) => {
  const isCallBack = req.query.var === 'callBack';
  const username = req.query.username as string;
  const domain = (req.query.domain as string) || '256k/700k';

  if (isCallBack) {
    if (username) {
      // User is logging in
      sessionState.isLoggedIn = true;
      sessionState.username = username;
      sessionState.speed = domain.split('_')[0] || '256k/700k';
      sessionState.updateOption = domain.includes('_Uoff') ? '_Uoff' : '_Uon';
      sessionState.startTime = Date.now();

      return res.json({
        logged_in: 'yes',
        username: sessionState.username,
        mac: sessionState.mac,
        link_login_only: '/login',
        sspeed: `${sessionState.speed}_`,
        update: sessionState.updateOption,
        ip: sessionState.ip,
        bytes_in: String(sessionState.bytesIn),
        bytes_out: String(sessionState.bytesOut),
        remain_bytes_total: String(sessionState.remainBytes),
        session_time_left: '4h30m',
        uptime: getUptimeString(sessionState.startTime),
        session_time_left_secs: '16200',
        uptime_secs: '300',
        trial: 'no',
        login_by: 'username',
        action: 'onLoggedIn',
      });
    }

    // Initial check (before login submitted)
    return res.json({
      logged_in: sessionState.isLoggedIn ? 'yes' : 'no',
      link_login_only: '/login',
      link_logout: '/logout',
      link_status: '/status',
      nas_id: 'TunisNet-MikroTik',
      ip: sessionState.ip,
      mac: sessionState.mac,
      trial: 'no',
      username: sessionState.isLoggedIn ? sessionState.username : '',
      action: 'onLoginStart',
    });
  }

  // Regular direct request
  res.sendFile(path.join(__dirname, 'index.html'));
});

// MikroTik Hotspot /status endpoint
app.get('/status', (req, res) => {
  const isCallBack = req.query.var === 'callBack';

  if (isCallBack) {
    const rawToken = `m056fd9fdfdsffsdffdfd1697455${sessionState.username}dsfd6571fgfgfgfgdf53sdfdsfgsd14`;

    return res.json({
      logged_in: sessionState.isLoggedIn ? 'yes' : 'no',
      mac: sessionState.mac,
      sspeed: `${sessionState.speed}_`,
      update: sessionState.updateOption,
      ip: sessionState.ip,
      bytes_in: String(sessionState.bytesIn),
      bytes_out: String(sessionState.bytesOut),
      remain_bytes_total: String(sessionState.remainBytes),
      session_time_left: '4h15m',
      uptime: getUptimeString(sessionState.startTime),
      bytesm: rawToken,
      trial: 'no',
      username: sessionState.username,
      action: 'onStatusQuery',
    });
  }

  // Direct page request
  res.sendFile(path.join(__dirname, 'index.html'));
});

// MikroTik Hotspot /logout endpoint
app.get('/logout', (req, res) => {
  sessionState.isLoggedIn = false;
  const isCallBack = req.query.var === 'callBack';

  if (isCallBack) {
    return res.json({
      logged_in: 'no',
      action: 'onLoggedOut',
    });
  }

  res.redirect('/');
});

// Serve static assets from project root and specific subfolders
// Public API endpoints for Notifications / Announcements system
app.get('/api/v1/public/content', (req, res) => {
  res.json({
    success: true,
    data: {
      notifications: [],
      announcements: []
    }
  });
});

// Endpoint to list available banner images dynamically from adimg folder
app.get('/api/banners', (req, res) => {
  try {
    const adDir = path.join(__dirname, 'adimg');
    if (fs.existsSync(adDir)) {
      const files = fs.readdirSync(adDir)
        .filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });
      return res.json({ success: true, images: files.map(f => `./adimg/${f}`) });
    }
  } catch (e) {
    console.error('Error reading adimg folder:', e);
  }
  res.json({ success: true, images: ['./adimg/1.jpg'] });
});

// Endpoint to save config.js directly from the admin dashboard
app.post('/api/save-config', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid content' });
    }
    const configPath = path.join(__dirname, 'config', 'config.js');
    fs.writeFileSync(configPath, content, 'utf-8');
    return res.json({ success: true, message: 'Config updated successfully' });
  } catch (err: any) {
    console.error('Error saving config.js:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
});

app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use('/adimg', express.static(path.join(__dirname, 'adimg')), (req, res) => {
  res.status(404).send('Image not found');
});
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/config', express.static(path.join(__dirname, 'config')));
app.use('/2024', express.static(path.join(__dirname, '2024')));
app.use(express.static(__dirname));

// Fallback route to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Hotspot Server] Running on http://0.0.0.0:${PORT}`);
});
