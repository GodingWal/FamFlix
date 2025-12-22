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
            r, w, e = select.select([fd], [], [], 300)
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
    # Run certbot
    run_ssh_command("certbot --nginx -d fam-flix.com -d www.fam-flix.com --non-interactive --agree-tos --email admin@fam-flix.com --redirect")
