import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    story_id = '63jme25ab1xmi90vppr'
    print(f"Checking narrations for story: {story_id}")
    
    cursor.execute("SELECT id, section_index, status, audio_url, error, created_at, updated_at FROM story_narrations WHERE story_id = ? ORDER BY section_index ASC", (story_id,))
    rows = cursor.fetchall()
    
    if not rows:
        print("No narrations found for this story.")
    else:
        for row in rows:
            print(f"Section {row[1]}: Status={row[2]}, Updated={row[6]}, Error={row[4]}")
            
    conn.close()
except Exception as e:
    print("Error:", e)
