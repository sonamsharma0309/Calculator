from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime
import ast
import operator as op
import math
import re

app = Flask(__name__)
DB_NAME = "database.db"

# ---------------- DB ----------------
def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL DEFAULT 'standard',
            expression TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    # backward safe upgrades
    try:
        conn.execute("ALTER TABLE history ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard'")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

# -------------- SAFE SCIENTIFIC EVAL --------------
ALLOWED_BIN_OPS = {
    ast.Add: op.add,
    ast.Sub: op.sub,
    ast.Mult: op.mul,
    ast.Div: op.truediv,
    ast.Mod: op.mod,
    ast.Pow: op.pow,
}
ALLOWED_UNARY_OPS = {ast.USub: op.neg, ast.UAdd: op.pos}

ALLOWED_FUNCS = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "sqrt": math.sqrt,
    "log": math.log10,
    "ln": math.log,
    "abs": abs,
}
ALLOWED_CONSTS = {"pi": math.pi, "e": math.e}

def _eval_node(node):
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("Invalid constant")

    if isinstance(node, ast.Name):
        if node.id in ALLOWED_CONSTS:
            return float(ALLOWED_CONSTS[node.id])
        raise ValueError("Unknown name")

    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        op_type = type(node.op)
        if op_type not in ALLOWED_BIN_OPS:
            raise ValueError("Operator not allowed")
        return ALLOWED_BIN_OPS[op_type](left, right)

    if isinstance(node, ast.UnaryOp):
        val = _eval_node(node.operand)
        op_type = type(node.op)
        if op_type not in ALLOWED_UNARY_OPS:
            raise ValueError("Unary op not allowed")
        return ALLOWED_UNARY_OPS[op_type](val)

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Invalid function")
        fname = node.func.id
        if fname not in ALLOWED_FUNCS:
            raise ValueError("Function not allowed")
        args = [_eval_node(a) for a in node.args]
        return float(ALLOWED_FUNCS[fname](*args))

    raise ValueError("Invalid expression")

def _format_result(val: float) -> str:
    if val == float("inf") or val == float("-inf"):
        raise ZeroDivisionError("Divide by zero")
    if math.isnan(val):
        raise ValueError("NaN")

    if abs(val) >= 1e12:
        return f"{val:.6e}"
    s = f"{val:.12f}".rstrip("0").rstrip(".")
    return s if s else "0"

def safe_eval(expr: str) -> str:
    expr = (expr or "").strip()
    if not expr:
        return "0"

    expr = expr.replace(" ", "")

    # percent: 50% => (50/100)
    expr = re.sub(r"(\d+(\.\d+)?)%", r"(\1/100)", expr)

    # allow only these characters
    if not re.fullmatch(r"[0-9+\-*/().,%a-zA-Z_]+", expr):
        raise ValueError("Invalid characters")

    tree = ast.parse(expr, mode="eval")
    val = _eval_node(tree)
    return _format_result(val)

# ---------------- ROUTES ----------------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/eval", methods=["POST"])
def api_eval():
    data = request.get_json(silent=True) or {}
    expr = data.get("expression", "")
    mode = (data.get("mode") or "standard").strip().lower()
    if mode not in ("standard", "scientific"):
        mode = "standard"

    try:
        result = safe_eval(expr)
    except ZeroDivisionError:
        return jsonify(ok=False, error="Divide by zero"), 400
    except Exception:
        return jsonify(ok=False, error="Invalid expression"), 400

    conn = get_db()
    conn.execute(
        "INSERT INTO history(mode, expression, result, created_at) VALUES (?, ?, ?, ?)",
        (mode, expr, result, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    conn.close()

    return jsonify(ok=True, result=result)

@app.route("/api/history", methods=["GET"])
def api_history():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, mode, expression, result, created_at FROM history ORDER BY id DESC LIMIT 30"
    ).fetchall()
    conn.close()
    return jsonify(ok=True, items=[dict(r) for r in rows])

@app.route("/api/history/clear", methods=["POST"])
def api_clear_history():
    conn = get_db()
    conn.execute("DELETE FROM history")
    conn.commit()
    conn.close()
    return jsonify(ok=True)

@app.route("/api/stats", methods=["GET"])
def api_stats():
    conn = get_db()
    row = conn.execute("SELECT COUNT(*) as total FROM history").fetchone()
    last = conn.execute("SELECT created_at FROM history ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return jsonify(ok=True, total=int(row["total"]), last=(last["created_at"] if last else None))

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
