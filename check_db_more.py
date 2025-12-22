import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    print("\nChecking voice_generations table schema:")
    cursor.execute("PRAGMA table_info(voice_generations);")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
        
    print("\nChecking recent voice_generations:")
    cursor.execute("SELECT * FROM voice_generations ORDER BY created_at DESC LIMIT 5;")
    rows = cursor.fetchall()
    for row in rows:
        print(row)

    print("\nChecking story_narrations table schema:")
    cursor.execute("PRAGMA table_info(story_narrations);")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
        
    print("\nChecking recent story_narrations:")
    cursor.execute("SELECT * FROM story_narrations ORDER BY created_at DESC LIMIT 5;")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
            
    conn.close()
except Exception as e:
    print("Error:", e)
