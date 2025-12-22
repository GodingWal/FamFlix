import pty
import os
import sys
import time
import select

def run_ssh_command(command):
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        os.execvp('ssh', ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'root@172.238.175.82', command])
    else:
        # Parent process
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 300) # Long timeout for install
            if not r:
                print("Timeout waiting for output")
                break
            
            try:
                chunk = os.read(fd, 1024)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                if b"password:" in chunk.lower() and not password_sent:
                    os.write(fd, b"Wittymango520\n")
                    password_sent = True
            except OSError:
                break

if __name__ == "__main__":
    run_ssh_command("chmod +x /root/setup_remote.sh && bash /root/setup_remote.sh")
