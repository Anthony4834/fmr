# Fix PAT 403 Error

Your PAT authenticates with GitHub API but fails for Git operations. This means it's missing the **"repo"** scope.

## The Problem

Your current PAT works for API calls but doesn't have permission to push/pull repositories.

## Solution: Create New Token with "repo" Scope

1. **Go to GitHub Token Settings**:
   - https://github.com/settings/tokens/new
   - Click **"Generate new token (classic)"**

2. **Configure Token**:
   - **Note**: `fmr-repo-access`
   - **Expiration**: Choose your preference (90 days, 1 year, or no expiration)
   - **Scopes**: Check **"repo"** checkbox
     - This automatically selects:
       - repo:status
       - repo_deployment
       - public_repo
       - repo:invite
       - security_events

3. **Generate Token**:
   - Click "Generate token" at the bottom
   - **IMPORTANT**: Copy the token immediately (you won't see it again!)

4. **Update Git Remote**:
   ```bash
   git remote set-url origin https://anthony4834:NEW_TOKEN_HERE@github.com/Anthony4834/fmr.git
   ```

5. **Test Push**:
   ```bash
   git push origin main
   ```

## Security Warning

⚠️ **You've exposed your PAT in this conversation!**

After we get this working, you should:
1. Revoke the old token: https://github.com/settings/tokens
2. Use the new token going forward
3. Never share tokens in chat/conversations

## Alternative: Use SSH (More Secure)

SSH keys are more secure and don't require tokens:

```bash
# Check for existing SSH key
ls -la ~/.ssh/id_*.pub

# If no key, generate one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: https://github.com/settings/keys
# Then update remote:
git remote set-url origin git@github.com:Anthony4834/fmr.git
```

