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
        output_buffer = b""
        while True:
            r, w, e = select.select([fd], [], [], 10)
            if not r:
                break
            
            try:
                chunk = os.read(fd, 1024)
                if not chunk:
                    break
                # sys.stdout.buffer.write(chunk) # Mute output to keep logs clean, or uncomment to debug
                output_buffer += chunk
                
                if b"password:" in chunk.lower() and not password_sent:
                    os.write(fd, b"Wittymango520\n")
                    password_sent = True
            except OSError:
                break
        
        # Print only the command output (try to filter out login banner if possible, but raw is fine for now)
        print(output_buffer.decode('utf-8', errors='ignore'))

if __name__ == "__main__":
    run_ssh_command("cat /etc/os-release")
