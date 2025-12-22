
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Mimic the config logic
const venvPath = path.resolve(process.cwd(), '.venv/bin/python3');
const pythonBin = fs.existsSync(venvPath) ? venvPath : "python3";

console.log(`Resolved Python Bin: ${pythonBin}`);

const pythonProcess = spawn(pythonBin, ['-c', 'import torch; print("Torch version:", torch.__version__)']);

pythonProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
});

pythonProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

pythonProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
});
