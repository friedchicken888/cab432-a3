import requests
import time
import random

BASE_URL = ""
LOGIN_URL = ""
FRACTAL_URL = ""

USERS = {
    "user": {"username": "user", "password": "Testtest123!"},
    "admin": {"username": "admin", "password": "Testtest123!"}
}

COLOUR_SCHEMES = ["rainbow", "greyscale", "fire", "hsl"]

def login(username, password):
    print(f"\nLogging in as {username}...")
    try:
        resp = requests.post(LOGIN_URL, json={"username": username, "password": password})
        if resp.status_code == 200:
            token = resp.json().get('idToken')
            if token:
                print("Login successful.")
                return token
            else:
                print("Login failed: idToken not found in response.")
                return None
        else:
            print(f"Login failed with status {resp.status_code}: {resp.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Login request failed: {e}")
        return None

def run_load_test(duration_seconds):
    start_time = time.time()
    request_count = 0

    loop_condition = True
    while loop_condition:
        selected_user_key = random.choice(list(USERS.keys()))
        selected_user = USERS[selected_user_key]
        jwt_token = login(selected_user["username"], selected_user["password"])

        if not jwt_token:
            print(f"Skipping request {request_count + 1} due to login failure.")
            time.sleep(1)
            continue

        headers = {"Authorization": f"Bearer {jwt_token}"}

        params = {
            "width": 1920,
            "height": 1080,
            "maxIterations": random.randint(250, 2500),
            "power": random.randint(2, 3),
            "scale": round(random.uniform(0.5, 1.5), 3),
            "offsetX": round(random.uniform(-1, 1), 3),
            "offsetY": round(random.uniform(-1, 1), 3),
            "colour": random.choice(COLOUR_SCHEMES),
            "real": round(random.uniform(-2, 2), 3),
            "imag": round(random.uniform(-2, 2), 3)
        }

        request_count += 1
        print(f'\nRequest {request_count} (as {selected_user["username"]}) with params {params}\n')

        req_start = time.time()
        try:
            resp = requests.get(FRACTAL_URL, params=params, headers=headers, timeout=180)
            req_time = time.time() - req_start

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    fractal_url = data.get('url')
                    fractal_hash = data.get('hash')
                    if fractal_url:
                        print(f"Request {request_count} done in {req_time:.2f}s. Fractal URL: {fractal_url}\n")
                    elif fractal_hash:
                        print(f"Request {request_count} done in {req_time:.2f}s. Fractal Hash: {fractal_hash}\n")
                    else:
                        print(f"Request {request_count} done in {req_time:.2f}s. Unexpected JSON response: {data}\n")
                except ValueError:
                    print(f"Request {request_count} done in {req_time:.2f}s. Response not JSON, size={len(resp.content)} \n")
            elif resp.status_code == 499:
                print(f"Request {request_count} aborted (time limit exceeded) after {req_time:.2f}s\n")
            else:
                print(f"Request {request_count} failed with status {resp.status_code}, content: {resp.text}\n")

        except requests.exceptions.RequestException as e:
            req_time = time.time() - req_start
            print(f"Request {request_count} failed after {req_time:.2f}s: {e}")
        
        if duration_seconds is not None:
            if time.time() - start_time >= duration_seconds:
                loop_condition = False

    total_duration_minutes = (time.time() - start_time) / 60
    print(f"\nSent {request_count} requests in {total_duration_minutes:.1f} minutes.")

if __name__ == "__main__":
    ip_address = input("Enter the server IP address (leave empty for localhost): ")
    if not ip_address:
        ip_address = "localhost"
    BASE_URL = f"http://{ip_address}:3000"
    LOGIN_URL = f"{BASE_URL}/api/auth/login"
    FRACTAL_URL = f"{BASE_URL}/api/fractal"

    duration_input = input("Enter the duration in minutes (leave empty for indefinite): ")
    duration_seconds = None
    if duration_input:
        try:
            duration_seconds = int(duration_input) * 60
        except ValueError:
            print("Invalid duration. Running indefinitely.")

    run_load_test(duration_seconds)