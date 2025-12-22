import pty
import os
import sys
import time
import select

def test_ssh():
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        # Try new IP with root user
        os.execvp('ssh', ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', 'root@172.238.175.82', 'ls -la'])
    else:
        # Parent process
        password_sent = False
        while True:
            r, w, e = select.select([fd], [], [], 10)
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
                    # Assuming same password
                    os.write(fd, b"Wittymango520\n")
                    password_sent = True
                    print("\n[DEBUG] Password sent")
            except OSError:
                break

if __name__ == "__main__":
    test_ssh()
