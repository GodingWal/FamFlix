import sqlite3
import json

conn = sqlite3.connect('famflix.db')
cursor = conn.cursor()

cursor.execute("SELECT id, title, metadata FROM template_videos")
rows = cursor.fetchall()

for row in rows:
    print(f"ID: {row[0]}, Title: {row[1]}")
    try:
        metadata = json.loads(row[2])
        print(f"Metadata: {json.dumps(metadata, indent=2)}")
    except:
        print(f"Metadata: {row[2]}")
    print("-" * 20)

conn.close()
