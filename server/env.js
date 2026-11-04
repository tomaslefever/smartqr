// Loads .env (if there is one) before the rest of the server reads process.env. Variables already set in
// the environment (Docker, Easypanel) win over the file. Imported first by server.js.
if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch {
        // No .env: the environment is configured some other way
    }
}
