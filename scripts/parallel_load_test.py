import asyncio
import aiohttp
import time
import random
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
BASE_URL = f'http://{os.getenv("SERVER_IP", "localhost")}:3000'
LOGIN_URL = f'{BASE_URL}/api/auth/login'
FRACTAL_URL = f'{BASE_URL}/api/fractal'
TEST_PASSWORD = os.getenv('TEST_PASSWORD')

def get_users_from_env():
    """Scans environment variables to find user configurations."""
    users = []
    i = 1
    while True:
        username = os.getenv(f'USER_{i}_NAME')
        if username:
            users.append({'username': username, 'password': TEST_PASSWORD})
            i += 1
        else:
            # Stop if we can't find the next numbered user
            break
    return users

async def login(session, username, password):
    """Logs in a single user and returns the JWT token."""
    print(f'[{username}] Logging in...')
    if not password:
        print(f'[{username}] Error: TEST_PASSWORD is not set in environment variables.')
        return None
    try:
        async with session.post(LOGIN_URL, json={"username": username, "password": password}) as resp:
            if resp.status == 200:
                data = await resp.json()
                token = data.get('idToken')
                if token:
                    print(f'[{username}] Login successful.')
                    return token
            else:
                text = await resp.text()
                print(f'[{username}] Login failed with status {resp.status}: {text}')
                return None
    except aiohttp.ClientError as e:
        print(f'[{username}] Login request failed: {e}')
        return None

def get_random_params():
    """Generates randomised parameters for a fractal request."""
    return {
        "width": random.randint(800, 1920),
        "height": random.randint(600, 1080),
        "maxIterations": random.randint(400, 1000),
        "power": 2,
        "scale": round(random.uniform(0.5, 2.0), 3),
        "colour": random.choice(["rainbow", "greyscale", "fire", "hsl"]),
    }

async def user_worker(username, password):
    """A worker that simulates a single user making requests in a loop."""
    print(f'[{username}] Worker starting.')
    headers = {}
    
    async with aiohttp.ClientSession() as session:
        # First, log in to get a token
        token = await login(session, username, password)
        if not token:
            print(f'[{username}] Worker exiting due to login failure.')
            return

        headers["Authorization"] = f"Bearer {token}"
        
        job_count = 0
        while True:
            job_count += 1
            params = get_random_params()
            req_start_time = time.time()
            print(f'[{username}] Starting job {job_count}...')
            
            try:
                # Make the request and wait for the full response from the server
                async with session.get(FRACTAL_URL, params=params, headers=headers, timeout=300) as resp:
                    req_time = time.time() - req_start_time
                    if resp.status == 200 or resp.status == 202:
                        print(f'[{username}] Job {job_count} completed (Status {resp.status}) in {req_time:.2f}s.')
                    else:
                        text = await resp.text()
                        print(f'[{username}] Job {job_count} failed (Status {resp.status}) in {req_time:.2f}s: {text}')

            except asyncio.TimeoutError:
                req_time = time.time() - req_start_time
                print(f'[{username}] Job {job_count} timed out waiting for server response after {req_time:.2f}s.')
            except aiohttp.ClientError as e:
                req_time = time.time() - req_start_time
                print(f'[{username}] Job {job_count} failed with client error after {req_time:.2f}s: {e}')

async def main():
    """Main function to set up and run the load test."""
    users = get_users_from_env()
    if not users:
        print("No users found in environment variables. Did you set USER_1_NAME, etc.?")
        print("Aborting load test.")
        return

    print(f"Found {len(users)} users to simulate: {[u['username'] for u in users]}")
    print("Starting workers...")
    
    # Create a task for each user worker
    tasks = [user_worker(u['username'], u['password']) for u in users]
    
    # Run all user workers concurrently
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nLoad test stopped by user.")
