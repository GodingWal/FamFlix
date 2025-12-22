import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    print("Checking story_narrations schema:")
    cursor.execute("PRAGMA table_info(story_narrations);")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
            
    conn.close()
except Exception as e:
    print("Error:", e)
