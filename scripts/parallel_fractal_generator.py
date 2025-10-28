import asyncio
import aiohttp
import os
import random
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.fractals.cab432.com/api"
TEST_PASSWORD = os.getenv('TEST_PASSWORD')

async def async_login(session, username, password):
    login_url = f"{BASE_URL}/auth/login"
    async with session.post(login_url, json={"username": username, "password": password}) as resp:
        data = await resp.json()
        if resp.status == 200 and data.get("idToken"):
            print(f"{username}: Logged in")
            return {"username": username, "token": data["idToken"]}
        return None

async def async_generate_fractal(session, user_data, max_iterations):
    username = user_data["username"]
    token = user_data["token"]
    url = f"{BASE_URL}/fractal"
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "width": 1921,
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

    await asyncio.sleep(random.uniform(1, 3))  # random delay before submit
    print(f"{username}: Submitting job with max_iterations={max_iterations}")
    async with session.get(url, headers=headers, params=params) as resp:
        data = await resp.json()
        if resp.status in (200, 202):
            print(f"{username}: Job started / retrieved: {data.get('hash', 'no-hash')}")
        else:
            print(f"{username}: Job failed: {data}")

async def user_loop(session, user_data, start_iterations):
    iterations = start_iterations
    while True:
        await async_generate_fractal(session, user_data, iterations)
        iterations += 1  # increment for next job

async def main():
    if not TEST_PASSWORD:
        print("TEST_PASSWORD not set")
        return

    usernames = [os.getenv(f"USER_{i}_NAME") for i in range(1, 10) if os.getenv(f"USER_{i}_NAME")]
    if not usernames:
        print("No users found")
        return

    start_iterations = int(input("Starting maxIterations: "))

    async with aiohttp.ClientSession() as session:
        # Log in all users
        login_tasks = [async_login(session, u, TEST_PASSWORD) for u in usernames]
        logged_in = await asyncio.gather(*login_tasks)
        logged_in = [u for u in logged_in if u]

        # Start a loop for each user
        loops = [user_loop(session, u, start_iterations + i) for i, u in enumerate(logged_in)]
        await asyncio.gather(*loops)

if __name__ == "__main__":
    asyncio.run(main())
