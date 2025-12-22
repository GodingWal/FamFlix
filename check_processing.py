import sqlite3

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    print("Checking for any items with status='processing' or similar...")
    
    tables_to_check = ['stories', 'voice_generations', 'story_narrations', 'video_projects', 'voice_profiles']
    
    for table in tables_to_check:
        try:
            # Check if status column exists
            cursor.execute(f"PRAGMA table_info({table});")
            cols = [c[1] for c in cursor.fetchall()]
            if 'status' in cols:
                print(f"\nChecking {table} for processing items:")
                cursor.execute(f"SELECT * FROM {table} WHERE status LIKE '%process%' OR status LIKE '%pending%' OR status LIKE '%generating%';")
                rows = cursor.fetchall()
                if rows:
                    for row in rows:
                        print(row)
                else:
                    print("No processing items found.")
            else:
                print(f"\n{table} does not have a status column.")
        except Exception as e:
            print(f"Error checking {table}: {e}")
            
    conn.close()
except Exception as e:
    print("Error:", e)
