import sqlite3
import time

try:
    conn = sqlite3.connect('famflix.db')
    cursor = conn.cursor()
    
    section_id = 'w5zidtnr28cmi90vppz'
    voice_id = '28cvbdx2158mhiishfl' # Assuming this is the voice ID based on previous logs, but I should verify.
    # Actually, I'll just update by section_id and status='PROCESSING' to be safe.
    
    audio_filename = 'cb-1763797302007-vspdDk.wav'
    audio_url = f'/api/audio/{audio_filename}'
    
    print(f"Recovering stuck processing entry for section: {section_id}")
    
    # Check if it's still processing
    cursor.execute("SELECT voice_id FROM story_audio WHERE section_id = ? AND status = 'PROCESSING'", (section_id,))
    row = cursor.fetchone()
    
    if not row:
        print("No processing entry found for this section. It might have been updated already.")
    else:
        voice_id = row[0]
        print(f"Found processing entry for voice: {voice_id}")
        
        update_query = """
        UPDATE story_audio
        SET status = 'COMPLETE', 
            audio_url = ?, 
            updated_at = ?,
            completed_at = ?
        WHERE section_id = ? AND voice_id = ?
        """
        now = int(time.time() * 1000)
        cursor.execute(update_query, (audio_url, now, now, section_id, voice_id))
        print(f"Updated section {section_id} to COMPLETE with url {audio_url}")
        
        conn.commit()
        print("Done.")
            
    conn.close()
except Exception as e:
    print("Error:", e)
