import pty
import os
import sys
import time
import select

def run_ssh_command(command):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('ssh', ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'root@172.238.175.82', command])
    else:
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 60)
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
    run_ssh_command("cd /var/www/famflix && ln -sf /var/www/famflix/dist/public /var/www/famflix/dist/server/public && pm2 restart famflix && sleep 2 && pm2 logs famflix --lines 20 --nostream")
