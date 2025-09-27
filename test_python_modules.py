#!/usr/bin/env python3
"""
Test script to verify Python modules are properly installed
Updated: 2025-09-27
"""

import sys
import json

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

if __name__ == "__main__":
    results = test_imports()
    print(json.dumps(results, indent=2))
