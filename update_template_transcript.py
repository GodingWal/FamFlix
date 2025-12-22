import sqlite3
import json

conn = sqlite3.connect('famflix.db')
cursor = conn.cursor()

# Get the current metadata
cursor.execute("SELECT metadata FROM template_videos WHERE id = 1")
row = cursor.fetchone()

if row:
    metadata = json.loads(row[0])
    
    # Add transcript
    transcript_text = "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z. Now I know my A B Cs. Next time won't you sing with me."
    
    # Update the transcript field in metadata (root level or inside pipeline/transcription?)
    # The code checks:
    # 1. sourceVideo -> metadata -> pipeline -> transcription -> segments
    # 2. templateMetadata -> transcript
    
    metadata['transcript'] = transcript_text
    
    # Also update pipeline just in case
    if 'pipeline' not in metadata:
        metadata['pipeline'] = {}
    
    metadata['pipeline']['transcription'] = {
        'fullText': transcript_text,
        'segments': [
            {'start': 0, 'end': 30, 'text': transcript_text}
        ]
    }

    new_metadata_json = json.dumps(metadata)
    
    cursor.execute("UPDATE template_videos SET metadata = ? WHERE id = 1", (new_metadata_json,))
    conn.commit()
    print("Updated metadata for template ID 1")
else:
    print("Template ID 1 not found")

conn.close()
