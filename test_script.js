const { execSync } = require('child_process');
execSync('npx agent-browser open http://localhost:8000/account/login/', {stdio: 'inherit'});
execSync('npx agent-browser eval "document.getElementById(\'id_username\').value=\'admin\'; document.getElementById(\'id_password\').value=\'admin\'; document.querySelector(\'button[type=submit]\').click();"', {stdio: 'inherit'});
execSync('npx agent-browser wait --load networkidle', {stdio: 'inherit'});
execSync('npx agent-browser open http://localhost:8000/wind/', {stdio: 'inherit'});
execSync('npx agent-browser wait --load networkidle', {stdio: 'inherit'});
execSync('npx agent-browser eval "document.body.innerHTML.length"', {stdio: 'inherit'});
execSync('npx agent-browser screenshot wind_test.png', {stdio: 'inherit'});
