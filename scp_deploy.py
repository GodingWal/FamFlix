import pty
import os
import sys
import time
import select

def scp_file():
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        # scp deploy.tar.gz root@172.238.175.82:/root/deploy.tar.gz
        os.execvp('scp', ['scp', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'deploy.tar.gz', 'root@172.238.175.82:/root/deploy.tar.gz'])
    else:
        # Parent process
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 10)
            if not r:
                # Timeout, but for SCP large file it might just be silent transfer
                # We should check if process is still alive
                try:
                    pid_status = os.waitpid(pid, os.WNOHANG)
                    if pid_status != (0, 0):
                        # Process exited
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
