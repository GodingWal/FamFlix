import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    story_id = '63jme25ab1xmi90vppr'
    print(f"Checking story_audio for story: {story_id}")
    
    # Join with story_sections to filter by story_id
    query = """
    SELECT sa.section_id, sa.voice_id, sa.status, sa.audio_url, sa.created_at, sa.updated_at
    FROM story_audio sa
    JOIN story_sections ss ON sa.section_id = ss.id
    WHERE ss.story_id = ?
    """
    
    cursor.execute(query, (story_id,))
    rows = cursor.fetchall()
    
    if not rows:
        print("No story_audio found for this story.")
    else:
        for row in rows:
            print(f"Section {row[0]}: Status={row[2]}, Updated={row[5]}")
            
    conn.close()
except Exception as e:
    print("Error:", e)
