import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    story_slug = 'the-little-astronaut'
    print(f"Checking sections for story: {story_slug}")
    
    # Get story ID
    cursor.execute("SELECT id FROM stories WHERE slug = ?", (story_slug,))
    story_row = cursor.fetchone()
    
    if not story_row:
        print("Story not found.")
    else:
        story_id = story_row[0]
        # Get sections
        cursor.execute("SELECT id, section_index, text FROM story_sections WHERE story_id = ? ORDER BY section_index", (story_id,))
        rows = cursor.fetchall()
        
        print(f"Found {len(rows)} sections.")
        for row in rows:
            print(f"Section {row[1]}: {row[2][:50]}...")
            
    conn.close()
except Exception as e:
    print("Error:", e)
