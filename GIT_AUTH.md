# Git Authentication with Personal Access Token (PAT)

GitHub no longer accepts passwords for Git operations. Use a Personal Access Token (PAT) instead.

## Quick Setup

### Option 1: Use PAT as Password (One-time)

When Git prompts for credentials:
- **Username**: `anthony4834` (your GitHub username)
- **Password**: Paste your PAT (not your GitHub password)

Git will store this in your macOS keychain.

### Option 2: Update Remote URL with PAT

```bash
# Replace YOUR_PAT with your actual token
git remote set-url origin https://anthony4834:YOUR_PAT@github.com/Anthony4834/fmr.git
```

⚠️ **Warning**: This stores your PAT in plain text in `.git/config`. Only use this for local repos.

### Option 3: Use SSH (Recommended)

1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Add SSH key to GitHub**:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the output and add it to GitHub: Settings → SSH and GPG keys → New SSH key
   ```

3. **Update remote to use SSH**:
   ```bash
   git remote set-url origin git@github.com:Anthony4834/fmr.git
   ```

## Current Setup

Your remote is currently:
```
https://github.com/Anthony4834/fmr.git
```

## Push with PAT

Try pushing again. When prompted:
- Username: `anthony4834`
- Password: Your PAT (it will be saved to keychain)

```bash
git push origin main
```

## Verify Authentication

Test your authentication:
```bash
git ls-remote origin
```

If this works without prompting, your credentials are saved correctly.

