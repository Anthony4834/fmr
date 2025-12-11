# Troubleshooting PAT 403 Error

A 403 error means your Personal Access Token doesn't have the right permissions or there's an authentication issue.

## Common Causes & Solutions

### 1. PAT Missing Required Scopes

Your PAT needs these scopes for Git operations:
- ✅ **repo** (Full control of private repositories) - Required for push/pull
- ✅ **workflow** (Update GitHub Action workflows) - If using GitHub Actions

**To check/fix:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Find your token or create a new one
3. Make sure **"repo"** scope is checked
4. If you created a "Fine-grained" token, ensure it has repository access

### 2. PAT Expired

- Classic tokens can expire
- Check the expiration date in GitHub settings
- Create a new token if expired

### 3. Wrong Username

Make sure you're using the correct GitHub username:
- Username: `anthony4834` (or your actual GitHub username)
- Password: Your PAT

### 4. Fine-Grained Token Issues

If using a fine-grained token:
- Ensure it has access to the specific repository
- Check repository permissions in token settings
- Fine-grained tokens are repository-specific

## Quick Fix: Create New Classic Token

1. **Go to GitHub**:
   - https://github.com/settings/tokens
   - Or: Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Click "Generate new token" → "Generate new token (classic)"**

3. **Set permissions**:
   - Name: `fmr-repo-access`
   - Expiration: Choose your preference
   - Scopes: Check **"repo"** (this includes all repo permissions)

4. **Generate and copy** the token immediately (you won't see it again)

5. **Use the new token**:
   ```bash
   git push origin main
   # Username: anthony4834
   # Password: <paste new PAT>
   ```

## Alternative: Use SSH Instead

SSH is often easier and more secure:

1. **Check if you have SSH keys**:
   ```bash
   ls -la ~/.ssh/id_*.pub
   ```

2. **If no key exists, generate one**:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter to accept default location
   # Optionally set a passphrase
   ```

3. **Copy your public key**:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the entire output
   ```

4. **Add to GitHub**:
   - Go to: https://github.com/settings/keys
   - Click "New SSH key"
   - Paste your public key
   - Save

5. **Update Git remote**:
   ```bash
   git remote set-url origin git@github.com:Anthony4834/fmr.git
   ```

6. **Test SSH connection**:
   ```bash
   ssh -T git@github.com
   # Should say: "Hi Anthony4834! You've successfully authenticated..."
   ```

7. **Push**:
   ```bash
   git push origin main
   ```

## Verify Current Setup

Check your current remote:
```bash
git remote -v
```

Check if credentials are cached:
```bash
git config --global credential.helper
```

Clear cached credentials if needed:
```bash
git credential-osxkeychain erase
host=github.com
protocol=https
# Press Enter twice
```

## Test Authentication

Test if your PAT works:
```bash
curl -H "Authorization: token YOUR_PAT" https://api.github.com/user
```

Replace `YOUR_PAT` with your actual token. Should return your user info.


