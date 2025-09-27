#!/usr/bin/env python3
"""
Test script to verify Python modules are properly installed
Updated: 2025-09-27
"""

import sys
import json
import os

def test_imports():
    """Test if required modules can be imported"""
    results = {}
    
    try:
        import snowflake
        results['snowflake'] = "Snowflake connector imported successfully"
    except ImportError as e:
        results['snowflake'] = f"Error: {e}"
    
    try:
        from snowflake.core import Root
        results['snowflake.core'] = "✓ Root imported successfully"
    except ImportError as e:
        results['snowflake.core'] = f"Error: {e}"
    
    try:
        from snowflake.snowpark import Session
        results['snowflake.snowpark'] = "✓ Session imported successfully"
    except ImportError as e:
        results['snowflake.snowpark'] = f"Error: {e}"
    
    try:
        from cryptography.hazmat.primitives import serialization
        results['cryptography'] = "✓ Serialization imported successfully"
    except ImportError as e:
        results['cryptography'] = f"Error: {e}"
    
    return results

def test_environment_variables():
    """Test environment variables for Cortex search"""
    env_vars = {}
    
    # Check for CORTEX_SNOWFLAKE_* variables
    cortex_vars = [
        'CORTEX_SNOWFLAKE_ACCOUNT',
        'CORTEX_SNOWFLAKE_USER', 
        'CORTEX_SNOWFLAKE_ROLE',
        'CORTEX_SNOWFLAKE_WAREHOUSE',
        'CORTEX_SNOWFLAKE_DATABASE',
        'CORTEX_SNOWFLAKE_SCHEMA',
        'CORTEX_SNOWFLAKE_PRIVATE_KEY'
    ]
    
    for var in cortex_vars:
        value = os.environ.get(var)
        if value:
            # Mask sensitive values
            if 'PRIVATE_KEY' in var:
                env_vars[var] = f"Set (length: {len(value)})"
            else:
                env_vars[var] = value
        else:
            env_vars[var] = "Not set"
    
    return env_vars

def test_python_packages():
    """Test installed Python packages"""
    import subprocess
    
    packages = {}
    
    # Check specific packages
    package_list = [
        'snowflake-connector-python',
        'cryptography'
    ]
    
    for package in package_list:
        try:
            result = subprocess.run([sys.executable, '-m', 'pip', 'show', package], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                packages[package] = "Installed"
            else:
                packages[package] = f"Not found: {result.stderr.strip()}"
        except Exception as e:
            packages[package] = f"Error checking: {e}"
    
    return packages

if __name__ == "__main__":
    results = test_imports()
    env_vars = test_environment_variables()
    packages = test_python_packages()
    
    output = {
        "imports": results,
        "environment_variables": env_vars,
        "packages": packages
    }
    
    print(json.dumps(output, indent=2))
