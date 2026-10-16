param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../store/assets'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$brandPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../store/assets/brand-source-512.png'))
$brand = [Drawing.Image]::FromFile($brandPath)
$brandSvg = [IO.File]::ReadAllText([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../extension/icons/brand.svg')))
function Color([string]$value) { [Drawing.ColorTranslator]::FromHtml($value) }
function Start-Art([int]$width, [int]$height) {
    $script:bitmap = New-Object Drawing.Bitmap($width, $height, ([Drawing.Imaging.PixelFormat]::Format24bppRgb))
    $script:graphics = [Drawing.Graphics]::FromImage($script:bitmap)
    $script:graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $script:graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $script:graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $script:graphics.Clear((Color '#191830'))
    $script:svg = [Collections.Generic.List[string]]::new()
    $script:svg.Add("<svg xmlns='http://www.w3.org/2000/svg' width='$width' height='$height' viewBox='0 0 $width $height'><rect width='$width' height='$height' fill='#191830'/>")
}
function Text-Art([string]$text, [float]$x, [float]$y, [float]$size, [string]$color, [bool]$bold = $false) {
    $style = [Drawing.FontStyle]::Regular
    if ($bold) { $style = [Drawing.FontStyle]::Bold }
    $font = New-Object Drawing.Font('Segoe UI', $size, $style, ([Drawing.GraphicsUnit]::Pixel))
    $brush = New-Object Drawing.SolidBrush((Color $color))
    $script:graphics.DrawString($text, $font, $brush, $x, $y, [Drawing.StringFormat]::GenericTypographic)
    $weight = if ($bold) { 700 } else { 400 }
    $escaped = [Security.SecurityElement]::Escape($text)
    $baseline = $y + $size
    $script:svg.Add("<text x='$x' y='$baseline' font-family='Segoe UI,Arial,sans-serif' font-size='$size' font-weight='$weight' fill='$color'>$escaped</text>")
    $font.Dispose(); $brush.Dispose()
}
function Ring-Art([float]$x, [float]$y, [float]$diameter, [string]$color, [float]$thickness = 1) {
    $pen = New-Object Drawing.Pen((Color $color), $thickness)
    $script:graphics.DrawEllipse($pen, $x, $y, $diameter, $diameter)
    $centerX = $x + $diameter / 2; $centerY = $y + $diameter / 2; $radius = $diameter / 2
    $script:svg.Add("<circle cx='$centerX' cy='$centerY' r='$radius' fill='none' stroke='$color' stroke-width='$thickness'/>")
    $pen.Dispose()
}
function Brand-Art([float]$x, [float]$y, [float]$size) {
    $script:graphics.DrawImage($brand, $x, $y, $size, $size)
    $script:svg.Add($brandSvg.Replace('<svg ', "<svg x='$x' y='$y' width='$size' height='$size' "))
}
function Save-Art([string]$name) {
    $script:svg.Add('</svg>')
    $script:bitmap.Save((Join-Path $destination ($name + '.png')), [Drawing.Imaging.ImageFormat]::Png)
    [IO.File]::WriteAllText((Join-Path $destination ($name + '.svg')), ($script:svg -join "`n"), [Text.UTF8Encoding]::new($false))
    $script:graphics.Dispose(); $script:bitmap.Dispose()
}
try {
    Start-Art 440 280
    Ring-Art 242 73 236 '#383255' 1.4
    Ring-Art 268 100 184 '#383255' 1.4
    Brand-Art 26 24 42
    Text-Art 'Yongil' 78 24 22 '#ffffff' $true
    Text-Art 'TRANSLATOR' 79 52 9 '#b7b2d7'
    Text-Art 'Read without' 28 108 30 '#ffffff' $true
    Text-Art 'boundaries.' 28 146 30 '#ffffff' $true
    Brand-Art 304 128 104
    Text-Art 'PAGE  /  BLOCK  /  SELECTION' 30 231 10 '#73dfc8'
    Save-Art 'promo-small-440x280'

    Start-Art 1400 560
    Ring-Art 840 -32 620 '#383255' 2
    Ring-Art 904 32 492 '#383255' 2
    Ring-Art 968 96 364 '#383255' 2
    Brand-Art 56 39 58
    Text-Art 'Yongil' 127 42 28 '#ffffff' $true
    Text-Art 'TRANSLATOR' 129 77 11 '#b7b2d7'
    Text-Art 'Read without' 64 173 64 '#ffffff' $true
    Text-Art 'boundaries.' 64 251 64 '#ffffff' $true
    Text-Art 'Translate pages, blocks, and selected text.' 68 360 22 '#cfcae6'
    Text-Art 'Restore the original. Keep exploring.' 68 396 22 '#cfcae6'
    Text-Art 'OPEN SOURCE  /  YOUR CHATGPT SUBSCRIPTION' 69 481 13 '#73dfc8'
    Brand-Art 998 147 264
    Save-Art 'promo-marquee-1400x560'

    $icon = New-Object Drawing.Bitmap(128, 128)
    $g = [Drawing.Graphics]::FromImage($icon)
    $g.Clear([Drawing.Color]::Transparent)
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($brand, 16, 16, 96, 96)
    $icon.Save((Join-Path $destination 'store-icon-128.png'), [Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $icon.Dispose()
} finally { $brand.Dispose() }
Write-Output 'Created two English promotional PNGs, editable SVGs, and a padded store icon.'
