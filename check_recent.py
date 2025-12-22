import sqlite3
import time
from datetime import datetime

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    current_ts = int(time.time())
    print(f"Current Timestamp: {current_ts} ({datetime.fromtimestamp(current_ts)})")
    
    print("\nChecking recent stories (last 3):")
    cursor.execute("SELECT id, title, status, created_at FROM stories ORDER BY created_at DESC LIMIT 3;")
    rows = cursor.fetchall()
    for row in rows:
        story_ts = row[3]
        diff = current_ts - story_ts if story_ts else 0
        print(f"ID: {row[0]}, Title: {row[1]}, Status: {row[2]}, Created: {story_ts} (Diff: {diff}s)")

    print("\nChecking recent voice_generations (last 3):")
    cursor.execute("SELECT id, status, created_at, metadata FROM voice_generations ORDER BY created_at DESC LIMIT 3;")
    rows = cursor.fetchall()
    for row in rows:
        gen_ts = row[2]
        diff = current_ts - gen_ts if gen_ts else 0
        print(f"ID: {row[0]}, Status: {row[1]}, Created: {gen_ts} (Diff: {diff}s)")
        
    conn.close()
except Exception as e:
    print("Error:", e)
