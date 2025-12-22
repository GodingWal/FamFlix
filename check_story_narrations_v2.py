import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    story_id = '63jme25ab1xmi90vppr'
    print(f"Checking narrations for story: {story_id}")
    
    # Use chunk_index instead of section_index
    cursor.execute("SELECT id, chunk_index, status, audio_url, created_at, updated_at FROM story_narrations WHERE story_id = ? ORDER BY chunk_index ASC", (story_id,))
    rows = cursor.fetchall()
    
    if not rows:
        print("No narrations found for this story.")
    else:
        for row in rows:
            print(f"Chunk {row[1]}: Status={row[2]}, Updated={row[5]}")
            
    conn.close()
except Exception as e:
    print("Error:", e)
