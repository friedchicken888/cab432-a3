import asyncio
import aiohttp
import time
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

# --- Shared State for Controlled Test ---
iteration_counter = 701
iteration_lock = asyncio.Lock()

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
            # Also check for a standalone admin user
            admin_user = os.getenv('ADMIN_NAME')
            if admin_user and not any(u['username'] == admin_user for u in users):
                users.insert(0, {'username': admin_user, 'password': TEST_PASSWORD})
            break
    return users

async def login(session, username, password):
    """Logs in a single user and returns the JWT token."""
    if not password:
        print(f'[{username}] Error: TEST_PASSWORD is not set in environment variables.')
        return None, username
    try:
        async with session.post(LOGIN_URL, json={"username": username, "password": password}) as resp:
            if resp.status == 200:
                data = await resp.json()
                token = data.get('idToken')
                if token:
                    return token, username
            else:
                text = await resp.text()
                print(f'[{username}] Login failed with status {resp.status}: {text}')
                return None, username
    except aiohttp.ClientError as e:
        print(f'[{username}] Login request failed: {e}')
        return None, username

async def get_next_iteration():
    """Atomically gets the next iteration number from the shared counter."""
    global iteration_counter
    async with iteration_lock:
        current_iteration = iteration_counter
        iteration_counter += 1
    return current_iteration

async def user_worker(username, token, initial_iteration):
    """A worker that simulates a single user, starting with an initial job and then looping."""
    headers = {"Authorization": f"Bearer {token}"}
    session = aiohttp.ClientSession(headers=headers)

    # Use a list to hold the iteration number for the first job
    iterations_to_process = [initial_iteration]

    while True:
        if not iterations_to_process:
            # Get the next iteration number from the shared pool for subsequent jobs
            next_iter = await get_next_iteration()
            iterations_to_process.append(next_iter)
        
        current_iteration = iterations_to_process.pop(0)
        
        params = {
            "width": 1920, "height": 1080, "iterations": current_iteration,
            "power": 2, "real": 0.285, "imag": 0.01, "scale": 1.5,
            "offsetX": 0, "offsetY": 0, "color": 'rainbow',
        }

        req_start_time = time.time()
        print(f'\n[{username}] Starting job with iterations: {params["iterations"]}...')
        
        try:
            async with session.get(FRACTAL_URL, params=params, timeout=30) as resp:
                if resp.status == 202:
                    data = await resp.json()
                    fractal_hash = data.get('hash')
                    if fractal_hash:
                        POLL_INTERVAL = 5
                        MAX_ATTEMPTS = 40
                        print(f'[{username}] Job queued. Polling for result... ', end="", flush=True)

                        for i in range(MAX_ATTEMPTS):
                            try:
                                async with session.get(f"{BASE_URL}/api/fractal/status/{fractal_hash}", timeout=10) as status_resp:
                                    if status_resp.status == 200:
                                        status_data = await status_resp.json()
                                        if status_data.get('status') == 'complete':
                                            req_time = time.time() - req_start_time
                                            print(f"\n[{username}] Job with iterations {params['iterations']} completed in {req_time:.2f}s.")
                                            break
                                    print(".", end="", flush=True)
                                    await asyncio.sleep(POLL_INTERVAL)
                            except asyncio.TimeoutError:
                                print("p", end="", flush=True)
                                await asyncio.sleep(POLL_INTERVAL)
                        else:
                            req_time = time.time() - req_start_time
                            print(f"\n[{username}] Job with iterations {params['iterations']} timed out after {req_time:.2f}s of polling.")
                else:
                    req_time = time.time() - req_start_time
                    text = await resp.text()
                    print(f'[{username}] Job failed on initial request (Status {resp.status}) in {req_time:.2f}s: {text}')

        except asyncio.TimeoutError:
            req_time = time.time() - req_start_time
            print(f'[{username}] Job initial request timed out after {req_time:.2f}s.')
        except aiohttp.ClientError as e:
            req_time = time.time() - req_start_time
            print(f'[{username}] Job failed with client error after {req_time:.2f}s: {e}')
        
        print("----------------------------------------")

    await session.close()

async def main():
    """Main function to set up and run the load test."""
    users_to_login = get_users_from_env()
    if not users_to_login:
        print("No users found in environment variables. Did you set USER_1_NAME, etc.?")
        return

    print(f"--- Phase 1: Logging in {len(users_to_login)} users ---")
    async with aiohttp.ClientSession() as login_session:
        login_tasks = [login(login_session, u['username'], u['password']) for u in users_to_login]
        results = await asyncio.gather(*login_tasks)
    
    logged_in_users = {username: token for token, username in results if token}

    if len(logged_in_users) != len(users_to_login):
        print("\nOne or more users failed to log in. Aborting load test.")
        return
    
    print("All users successfully logged in.")
    print("--- Phase 2: Starting fractal generation ---")

    # Sequentially assign the first job
    worker_tasks = []
    for username, token in logged_in_users.items():
        initial_iteration = await get_next_iteration()
        worker_tasks.append(user_worker(username, token, initial_iteration))
    
    # Run all workers concurrently
    await asyncio.gather(*worker_tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nLoad test stopped by user.")
