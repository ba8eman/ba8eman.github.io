from flask import Flask, jsonify
import random

app = Flask(__name__)

CATS = [
    "https://cataas.com/cat",
    "https://cataas.com/cat/cute",
    "https://cataas.com/cat/says/hello",
    "https://cataas.com/cat/gif",
    "https://cataas.com/cat/says/hi",
    "https://cataas.com/cat/says/Meow",
    "https://cataas.com/cat/says/%F0%9F%90%B1"
]

@app.route("/")
def index():
    return "🐱 Cat Generator API is running!"

@app.route("/cat")
def get_cat():
    return jsonify({"url": random.choice(CATS)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)

