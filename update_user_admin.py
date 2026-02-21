import sqlite3
import sys

DB_PATH = 'voxtree.db'
EMAIL = 'gwal325@gmail.com'

def update_user():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if user exists
        cursor.execute("SELECT id, username, role, plan FROM users WHERE email = ?", (EMAIL,))
        user = cursor.fetchone()

        if user:
            print(f"User found: ID={user[0]}, Username={user[1]}, Role={user[2]}, Plan={user[3]}")
            
            # Update user
            cursor.execute("UPDATE users SET role = 'admin', plan = 'pro' WHERE email = ?", (EMAIL,))
            conn.commit()
            
            print(f"Successfully updated user {EMAIL} to Admin role and Pro plan.")
        else:
            print(f"User with email {EMAIL} not found.")
            print("Please ask the user to sign up first.")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    update_user()
