#!/bin/bash

# Thai Font Verification Script for Ubuntu
# This script checks if Thai fonts are properly installed and working

echo "🔍 Checking Thai Font Installation on Ubuntu..."
echo "=============================================="

# Check if Thai font packages are installed
echo "📦 Checking installed Thai font packages:"
dpkg -l | grep -E "fonts-thai|fonts-noto.*thai|fonts-dejavu" | while read line; do
    echo "  ✅ $line"
done

echo ""

# List available Thai fonts
echo "🔤 Available Thai fonts in system:"
fc-list :lang=th family | sort | uniq | while read font; do
    echo "  📝 $font"
done

echo ""

# Test font rendering capability
echo "🧪 Testing Thai font rendering..."
echo "  Sample Thai text: ธนาคารกรุงเทพ อัตราแลกเปลี่ยนเงินตราต่างประเทศ"

# Check if fonts are cached
echo ""
echo "🔄 Font cache status:"
fc-cache -v | grep -E "succeeded|failed" | head -5

echo ""
echo "✅ Thai font check completed!"
echo ""
echo "💡 If fonts are missing, run:"
echo "   sudo apt-get install -y fonts-thai-tlwg fonts-noto-cjk fonts-dejavu"
echo "   sudo fc-cache -fv"
