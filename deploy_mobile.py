import pty
import os
import sys
import time
import select

def scp_and_deploy():
    # Step 1: SCP the file
    print("Uploading mobile updates to server...")
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('scp', ['scp', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'deploy_mobile.tar.gz', 'root@172.238.175.82:/root/deploy_mobile.tar.gz'])
    else:
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
            except OSError:
                break
    
    # Step 2: SSH and deploy
    print("\nDeploying on server...")
    pid2, fd2 = pty.fork()
    if pid2 == 0:
        os.execvp('ssh', ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'root@172.238.175.82', 
                          'cd /var/www/famflix && rm -rf dist && tar -xzf /root/deploy_mobile.tar.gz && pm2 restart famflix'])
    else:
        password_sent2 = False
        while True:
            r, w, e = select.select([fd2], [], [], 60)
            if not r:
                break
            
            try:
                chunk = os.read(fd2, 1024)
                if not chunk:
                    break
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                if b"password:" in chunk.lower() and not password_sent2:
                    os.write(fd2, b"Wittymango520\n")
                    password_sent2 = True
            except OSError:
                break

if __name__ == "__main__":
    scp_and_deploy()
