import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables:", tables)
    
    # Check stories table if it exists
    if ('stories',) in tables:
        print("\nChecking stories table schema:")
        cursor.execute("PRAGMA table_info(stories);")
        columns = cursor.fetchall()
        for col in columns:
            print(col)
            
        print("\nChecking recent stories:")
        # Select last 5 stories
        cursor.execute("SELECT * FROM stories ORDER BY created_at DESC LIMIT 5;")
        rows = cursor.fetchall()
        for row in rows:
            print(row)
            
    conn.close()
except Exception as e:
    print("Error:", e)
