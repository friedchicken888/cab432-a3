import asyncio
import aiohttp
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

BASE_URL = ""
TEST_PASSWORD = os.getenv('TEST_PASSWORD')

async def async_login(session, username, password):
    """Logs in a user asynchronously and returns the JWT token."""
    login_url = f"{BASE_URL}/auth/login"
    try:
        async with session.post(login_url, json={"username": username, "password": password}) as response:
            response.raise_for_status()
            data = await response.json()
            if response.status == 200 and data.get('idToken'):
                print(f"\nUser {username}: Logged in successfully.")
                return {"username": username, "token": data['idToken']}
            elif response.status == 202 and data.get('challengeName') == 'EMAIL_OTP':
                print(f"\nUser {username}: MFA challenge initiated. This script does not support MFA.")
                return None
            else:
                print(f"\nUser {username}: Login failed with unexpected response: {data}")
                return None
    except aiohttp.ClientResponseError as e:
        print(f"\nUser {username}: Login failed: HTTP {e.status} - {e.message}")
        return None
    except aiohttp.ClientError as e:
        print(f"\nUser {username}: Login failed: {e}")
        return None

async def async_poll_fractal_status(session, token, fractal_hash, username):
    """Polls the status of a fractal generation job asynchronously."""
    status_url = f"{BASE_URL}/fractal/status/{fractal_hash}"
    headers = {"Authorization": f"Bearer {token}"}
    POLL_INTERVAL = 5  # seconds
    MAX_ATTEMPTS = 40  # 40 attempts * 5 seconds = 200 seconds (~3.3 minutes)

    for i in range(MAX_ATTEMPTS):
        try:
            async with session.get(status_url, headers=headers, timeout=10) as response:
                response.raise_for_status()
                status_data = await response.json()

                if status_data.get('status') == 'complete':
                    print(f"\nUser {username}: Fractal {fractal_hash[:8]}... generated successfully! URL: {status_data.get('url')}")
                    return status_data.get('url')
                else:  # status is 'pending'
                    print(f"\nUser {username}: Fractal {fractal_hash[:8]}... pending ({i+1}/{MAX_ATTEMPTS})...")
                    await asyncio.sleep(POLL_INTERVAL)

        except aiohttp.ClientResponseError as e:
            print(f"\nUser {username}: Error polling status for {fractal_hash[:8]}...: HTTP {e.status} - {e.message}")
            await asyncio.sleep(POLL_INTERVAL)
        except aiohttp.ClientError as e:
            print(f"\nUser {username}: Error polling status for {fractal_hash[:8]}...: {e}")
            await asyncio.sleep(POLL_INTERVAL)
    
    print(f"\nUser {username}: Fractal {fractal_hash[:8]}... generation timed out.")
    return None

async def async_generate_fractal(session, user_data, start_max_iterations, user_index):
    """Generates a fractal for a user asynchronously."""
    username = user_data['username']
    token = user_data['token']
    generate_url = f"{BASE_URL}/fractal"
    headers = {"Authorization": f"Bearer {token}"}

    # Calculate unique maxIterations
    max_iterations = start_max_iterations + user_index

    params = {
        "width": 1920,
        "height": 1080,
        "iterations": max_iterations,
        "power": 2,
        "real": 0.285,
        "imag": 0.01,
        "scale": 1,
        "offsetX": 0,
        "offsetY": 0,
        "color": "rainbow",
    }

    print(f"\nUser {username}: Submitting fractal generation request with maxIterations={max_iterations}...")
    try:
        async with session.get(generate_url, headers=headers, params=params, timeout=30) as response:
            response.raise_for_status()
            data = await response.json()

            if response.status == 200 and data.get('url'):
                print(f"\nUser {username}: Fractal {data.get('hash')[:8]}... retrieved from cache successfully! URL: {data.get('url')}")
                return data.get('url')
            elif response.status == 202 and data.get('hash'):
                fractal_hash = data.get('hash')
                print(f"\nUser {username}: Fractal {fractal_hash[:8]}... queued for generation.")
                return await async_poll_fractal_status(session, token, fractal_hash, username)
            else:
                print(f"\nUser {username}: Unexpected response for generation: {data}")
                return None
    except aiohttp.ClientResponseError as e:
        print(f"\nUser {username}: Fractal generation failed: HTTP {e.status} - {e.message}")
        return None
    except aiohttp.ClientError as e:
        print(f"\nUser {username}: Fractal generation failed: {e}")
        return None

def get_quick_login_usernames():
    """Scans environment variables to build a list of quick login usernames, excluding admin."""
    usernames = []
    
    i = 1
    while True:
        user = os.getenv(f'USER_{i}_NAME')
        if user:
            usernames.append(user)
            i += 1
        else:
            break
    return usernames

async def main():
    global BASE_URL
    server_ip = os.getenv('SERVER_IP', 'localhost')
    BASE_URL = f"http://{server_ip}:3000/api"
    print(f"Using API Base URL: {BASE_URL}")

    if not TEST_PASSWORD:
        print("Error: TEST_PASSWORD not set in .env file. Exiting.")
        return

    usernames_to_test = get_quick_login_usernames()
    if not usernames_to_test:
        print("No quick login users found in .env file (e.g., ADMIN_NAME, USER_1_NAME). Exiting.")
        return

    try:
        start_max_iterations_str = input("Enter the starting maxIterations value (e.g., 501): ")
        start_max_iterations = int(start_max_iterations_str)
    except ValueError:
        print("Invalid input for maxIterations. Please enter an integer. Exiting.")
        return

    print(f"Attempting to log in {len(usernames_to_test)} users and generate fractals...")

    async with aiohttp.ClientSession() as session:
        # 1. Log in all users in parallel
        login_tasks = [async_login(session, username, TEST_PASSWORD) for username in usernames_to_test]
        logged_in_users_data = await asyncio.gather(*login_tasks)
        
        # Filter out failed logins
        logged_in_users_data = [user for user in logged_in_users_data if user is not None]

        if not logged_in_users_data:
            print("No users logged in successfully. Exiting.")
            return

        print(f"Successfully logged in {len(logged_in_users_data)} users.")

        # 2. Generate fractals for logged-in users in parallel
        generation_tasks = [
            async_generate_fractal(session, user_data, start_max_iterations, i)
            for i, user_data in enumerate(logged_in_users_data)
        ]
        await asyncio.gather(*generation_tasks)

    print("\nAll fractal generation tasks initiated and monitored.")

if __name__ == "__main__":
    asyncio.run(main())
