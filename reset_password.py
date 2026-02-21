import sqlite3
import bcrypt

DB_PATH = 'voxtree.db'
EMAIL = 'gwal325@gmail.com'
PASSWORD = 'password123'

def reset_password():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Hash password
        hashed = bcrypt.hashpw(PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        print(f"Resetting password for {EMAIL}...")
        cursor.execute("UPDATE users SET password = ? WHERE email = ?", (hashed, EMAIL))
        
        if cursor.rowcount > 0:
            print("Password updated successfully.")
            conn.commit()
        else:
            print("User not found.")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    reset_password()
