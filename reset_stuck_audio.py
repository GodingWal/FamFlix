import sqlite3
import time

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    story_id = '8p46vkwmr2xmi90vpq6' # The Sleepy Bear ID from logs
    print(f"Resetting stuck processing entries for story: {story_id}")
    
    # Find processing entries
    query = """
    SELECT sa.section_id
    FROM story_audio sa
    JOIN story_sections ss ON sa.section_id = ss.id
    WHERE ss.story_id = ? AND sa.status = 'PROCESSING'
    """
    
    cursor.execute(query, (story_id,))
    rows = cursor.fetchall()
    
    if not rows:
        print("No stuck entries found.")
    else:
        print(f"Found {len(rows)} stuck entries. Updating to ERROR...")
        for row in rows:
            section_id = row[0]
            update_query = """
            UPDATE story_audio
            SET status = 'ERROR', error = 'Processing timed out (reset by admin)', updated_at = ?
            WHERE section_id = ?
            """
            cursor.execute(update_query, (int(time.time() * 1000), section_id))
            print(f"Updated section {section_id} to ERROR")
            
        conn.commit()
        print("Done.")
            
    conn.close()
except Exception as e:
    print("Error:", e)
