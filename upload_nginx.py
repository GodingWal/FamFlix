import pty
import os
import sys
import time
import select

def scp_file():
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        os.execvp('scp', ['scp', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'nginx_config', 'root@172.238.175.82:/etc/nginx/sites-available/fam-flix'])
    else:
        # Parent process
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 10)
            if not r:
                try:
                    pid_status = os.waitpid(pid, os.WNOHANG)
                    if pid_status != (0, 0):
                        break
                except ChildProcessError:
                    break
                continue
            
            try:
                chunk = os.read(fd, 1024)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                if b"password:" in chunk.lower() and not password_sent:
                    os.write(fd, b"Wittymango520\n")
                    password_sent = True
                    print("\n[DEBUG] Password sent")
            except OSError:
                break

if __name__ == "__main__":
    scp_file()
