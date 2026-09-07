param(
    [string]$SourceDirectory = (Join-Path $PSScriptRoot '..\src\renderer\assets\subject-icons'),
    [string]$DestinationDirectory = (Join-Path $PSScriptRoot '..\android\app\src\main\res\drawable')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$processorSource = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class SubjectIconProcessor
{
    private static bool IsBackgroundWhite(Color color)
    {
        var minimum = Math.Min(color.R, Math.Min(color.G, color.B));
        var maximum = Math.Max(color.R, Math.Max(color.G, color.B));
        return color.A > 0 && minimum >= 232 && maximum - minimum <= 22;
    }

    public static void Process(string sourcePath, string destinationPath)
    {
        using (var source = new Bitmap(sourcePath))
        {
            var left = source.Width;
            var top = source.Height;
            var right = -1;
            var bottom = -1;

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    if (IsBackgroundWhite(source.GetPixel(x, y))) continue;
                    left = Math.Min(left, x);
                    top = Math.Min(top, y);
                    right = Math.Max(right, x);
                    bottom = Math.Max(bottom, y);
                }
            }

            if (right < left || bottom < top)
                throw new InvalidDataException("No subject artwork found in " + sourcePath);

            var artworkWidth = right - left + 1;
            var artworkHeight = bottom - top + 1;
            var padding = Math.Max(10, (int)Math.Ceiling(Math.Max(artworkWidth, artworkHeight) * 0.045));
            var cropLeft = Math.Max(0, left - padding);
            var cropTop = Math.Max(0, top - padding);
            var cropRight = Math.Min(source.Width - 1, right + padding);
            var cropBottom = Math.Min(source.Height - 1, bottom + padding);
            var cropWidth = cropRight - cropLeft + 1;
            var cropHeight = cropBottom - cropTop + 1;

            using (var cropped = new Bitmap(cropWidth, cropHeight, PixelFormat.Format32bppArgb))
            {
                using (var graphics = Graphics.FromImage(cropped))
                {
                    graphics.Clear(Color.Transparent);
                    graphics.DrawImage(
                        source,
                        new Rectangle(0, 0, cropWidth, cropHeight),
                        new Rectangle(cropLeft, cropTop, cropWidth, cropHeight),
                        GraphicsUnit.Pixel
                    );
                }

                RemoveBorderConnectedWhite(cropped);
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                cropped.Save(destinationPath, ImageFormat.Png);
            }
        }
    }

    private static void RemoveBorderConnectedWhite(Bitmap bitmap)
    {
        var width = bitmap.Width;
        var height = bitmap.Height;
        var visited = new bool[width * height];
        var queue = new Queue<int>();

        Action<int, int> enqueue = (x, y) =>
        {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            var index = y * width + x;
            if (visited[index] || !IsBackgroundWhite(bitmap.GetPixel(x, y))) return;
            visited[index] = true;
            queue.Enqueue(index);
        };

        for (var x = 0; x < width; x++)
        {
            enqueue(x, 0);
            enqueue(x, height - 1);
        }
        for (var y = 0; y < height; y++)
        {
            enqueue(0, y);
            enqueue(width - 1, y);
        }

        while (queue.Count > 0)
        {
            var index = queue.Dequeue();
            var x = index % width;
            var y = index / width;
            var color = bitmap.GetPixel(x, y);
            bitmap.SetPixel(x, y, Color.FromArgb(0, color.R, color.G, color.B));
            enqueue(x - 1, y);
            enqueue(x + 1, y);
            enqueue(x, y - 1);
            enqueue(x, y + 1);
        }
    }
}
'@

Add-Type -TypeDefinition $processorSource -ReferencedAssemblies System.Drawing

$nameMap = @{
    'araling-panlipunan' = 'araling_panlipunan'
    'epp-tle' = 'epp_tle'
    'reading-literacy' = 'reading_literacy'
    'shs-arts-media-design' = 'shs_arts_media_design'
    'shs-business-entrepreneurship' = 'shs_business_entrepreneurship'
    'shs-language-communication' = 'shs_language_communication'
    'shs-mathematics' = 'shs_mathematics'
    'shs-physical-education-sports' = 'shs_physical_education_sports'
    'shs-research-immersion' = 'shs_research_immersion'
    'shs-science-technology' = 'shs_science_technology'
    'shs-social-sciences-humanities' = 'shs_social_sciences_humanities'
    'shs-technical-vocational' = 'shs_technical_vocational'
    'shs-values-personal-development' = 'shs_values_personal_development'
}

Get-ChildItem -LiteralPath $SourceDirectory -Filter '*.png' | Sort-Object Name | ForEach-Object {
    $baseName = $_.BaseName
    $androidName = if ($nameMap.ContainsKey($baseName)) { $nameMap[$baseName] } else { $baseName }
    $destination = Join-Path $DestinationDirectory ($androidName + '.png')
    [SubjectIconProcessor]::Process($_.FullName, $destination)
    Write-Host ("Prepared {0} -> {1}" -f $_.Name, (Split-Path $destination -Leaf))
}
