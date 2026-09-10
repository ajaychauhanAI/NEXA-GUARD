/**
 * NEXA-GUARD Server Entry Point
 * Self-Healing Institutional Gateway with Automatic Port Conflict Resolution
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { execSync } = require('child_process');
const app = require('./src/app');
const db = require('./src/config/db');
const { startCurfewMonitor, stopCurfewMonitor } = require('./src/jobs/curfewMonitor');

const PORT = parseInt(process.env.PORT || '5000', 10);
let activeServer = null;

/**
 * Automatically terminate any lingering or zombie process holding the port
 * Works seamlessly across Windows (PowerShell/CMD) and Unix/Linux/macOS
 */
function freePort(port) {
    try {
        if (process.platform === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
            const lines = output.split('\r\n').map(l => l.trim()).filter(Boolean);
            const pids = new Set();
            for (const line of lines) {
                const parts = line.split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && !isNaN(pid) && parseInt(pid, 10) > 0 && parseInt(pid, 10) !== process.pid) {
                    pids.add(pid);
                }
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                    console.log(`⚡ Port ${port} was busy. Automatically terminated lingering process (PID ${pid}).`);
                } catch (e) { }
            }
        } else {
            try {
                execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
            } catch (e) {
                execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: 'ignore' });
            }
        }
    } catch (e) {
        // Port was already free or no process found
    }
}

/**
 * Initialize and start the HTTP server with self-healing retry logic
 */
function startServer(port, isRetry = false) {
    const server = app.listen(port, '0.0.0.0', () => {
        activeServer = server;
        console.log('====================================================');
        console.log(`🔗 Local URL: http://localhost:${port}`);
        console.log('====================================================');
    });

    server.on('error', async (err) => {
        if (err.code === 'EADDRINUSE') {
            if (!isRetry) {
                console.log(`\n⚠️ Port ${port} is occupied by another process. Automatically freeing port...`);
                freePort(port);
                // Allow operating system 400ms to recycle the socket
                await new Promise(res => setTimeout(res, 400));
                console.log(`🔄 Retrying server initialization on port ${port}...\n`);
                startServer(port, true);
            } else {
                console.error(`\n❌ Could not automatically free Port ${port}.`);
                console.error(`👉 In PowerShell, run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess -Force\n`);
                process.exit(1);
            }
        } else {
            console.error('Server execution error:', err);
            process.exit(1);
        }
    });

    return server;
}

// Start the server
startServer(PORT);

// Graceful termination handlers
function handleGracefulShutdown(signal) {
    try {
        stopCurfewMonitor();
    } catch (e) { }

    if (activeServer) {
        activeServer.close(() => {
            db.pool.end().finally(() => {
                console.log('Process terminated cleanly.');
                process.exit(0);
            });
        });
        // Force exit after timeout if sockets linger
        setTimeout(() => process.exit(0), 1500).unref();
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

// Prevent background async task errors from terminating the enterprise server
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection (intercepted):', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception (intercepted):', err);
});
