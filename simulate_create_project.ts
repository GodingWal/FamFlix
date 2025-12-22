import fetch from 'node-fetch';

async function createProject() {
    try {
        // 1. Login to get token
        console.log('Logging in...');
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'gwal325@gmail.com', password: 'password123' })
        });

        if (!loginRes.ok) {
            throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
        }

        const loginData = await loginRes.json();
        console.log('Login Data:', loginData);
        const token = loginData.accessToken || loginData.token;
        console.log('Got token:', token ? 'Yes' : 'No');

        // 2. Create project
        console.log('Creating project...');
        const projectRes = await fetch('http://localhost:5000/api/video-projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                templateVideoId: 1,
                voiceProfileId: null, // Optional
                faceImageUrl: null,   // Optional
                metadata: { description: "Test Project" }
            })
        });

        const text = await projectRes.text();
        console.log(`Response Status: ${projectRes.status}`);
        console.log('Response Body:', text);

    } catch (error) {
        console.error('Error:', error);
    }
}

createProject();
