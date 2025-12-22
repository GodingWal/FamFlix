import pty
import os
import sys
import select

def deploy():
    # Step 1: Create tarball
    print("Creating deployment package...")
    os.system("tar -czf deploy_gpu_integration.tar.gz dist/")
    
    # Step 2: Upload
    print("Uploading to server...")
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('scp', ['scp', '-o', 'StrictHostKeyChecking=no', 'deploy_gpu_integration.tar.gz', 'root@172.238.175.82:/root/'])
    else:
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 60)
            if not r:
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
    
    # Step 3: Deploy on server
    print("\nDeploying...")
    pid2, fd2 = pty.fork()
    if pid2 == 0:
        os.execvp('ssh', ['ssh', '-o', 'StrictHostKeyChecking=no', 'root@172.238.175.82', 
                          'cd /var/www/famflix && rm -rf dist && tar -xzf /root/deploy_gpu_integration.tar.gz && pm2 restart famflix'])
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
    deploy()
