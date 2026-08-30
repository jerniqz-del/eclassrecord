package com.example.eclassrecordmobile.ui.main

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.eclassrecordmobile.R
import com.example.eclassrecordmobile.data.Assignment

data class SubjectVisual(
    val key: String,
    val color: Color,
    @DrawableRes val iconRes: Int?,
)

object SubjectVisuals {
    fun forAssignment(assignment: Assignment): SubjectVisual {
        val key = iconKey(assignment.subject, assignment.gradeLevel, assignment.subjectGroup)
        return SubjectVisual(
            key = key,
            color = subjectColor(assignment.subject),
            iconRes = drawableFor(key),
        )
    }

    fun subjectColor(subject: String): Color {
        val value = subject.lowercase()
        return when {
            "english" in value -> Color(0xFF0EA5E9)
            listOf("filipin", "wika", "komunikasyon").any(value::contains) -> Color(0xFF1E40AF)
            listOf("math", "matematika", "numero").any(value::contains) -> Color(0xFF16A34A)
            listOf("science", "siyensya", "agham").any(value::contains) -> Color(0xFFEA580C)
            listOf("araling", "panlipunan", "hekasi", "sibika").any(value::contains) -> Color(0xFFDC2626)
            listOf("epp", "tle", "technology", "livelihood", "edukasyong pantahanan").any(value::contains) -> Color(0xFF7C3AED)
            listOf("mapeh", "music", "arts", "physical", "health").any(value::contains) -> Color(0xFFCA8A04)
            listOf("gmrc", "good manners", "values", "edukasyon sa pagpapakatao", "esp").any(value::contains) -> Color(0xFF92400E)
            else -> Color(0xFF64748B)
        }
    }

    private fun iconKey(subject: String, gradeLevel: String, subjectGroup: String): String {
        val grade = gradeLevel.toIntOrNull()
        val value = subject.trim().lowercase()
        if (grade == 11 || grade == 12) {
            val group = subjectGroup.uppercase()
            return when {
                group == "SHS_TECHPRO" || listOf("caregiving", "agricultural", "automotive", "carpentry", "welding", "computer programming", "computer systems", "electrical installation", "electronics", "tourism").any(value::contains) -> "shs-technical-vocational"
                group in setOf("SHS_RESEARCH", "SHS_WORK", "SHS_FIELD") || listOf("research", "work immersion", "apprenticeship", "field exposure", "design and innovation").any(value::contains) -> "shs-research-immersion"
                listOf("sports", "physical education", "human movement", "exercise", "fitness", "first aid").any(value::contains) -> "shs-physical-education-sports"
                listOf("business", "accounting", "finance", "taxation", "economics", "marketing", "entrepreneurship", "organization and management").any(value::contains) -> "shs-business-entrepreneurship"
                listOf("mathematics", "calculus").any(value::contains) -> "shs-mathematics"
                listOf("science", "biology", "chemistry", "physics", "database", "data analytics", "empowerment technologies").any(value::contains) -> "shs-science-technology"
                listOf("citizenship", "civic engagement", "history", "kasaysayan", "philosophy", "governance", "politics", "social sciences").any(value::contains) -> "shs-social-sciences-humanities"
                listOf("life and career skills", "personal development", "values", "good manners", "religion").any(value::contains) -> "shs-values-personal-development"
                group == "SHS_ARTS" || listOf("art", "creative", "composition", "dance", "literary", "literature", "media", "music", "theater", "visual").any(value::contains) -> "shs-arts-media-design"
                listOf("communication", "komunikasyon", "filipino", "language", "reading", "writing").any(value::contains) -> "shs-language-communication"
                else -> ""
            }
        }
        return when {
            "reading" in value || "literacy" in value -> "reading-literacy"
            "makabansa" in value -> "makabansa"
            "math" in value -> "mathematics"
            listOf("gmrc", "values education", "good manners").any(value::contains) -> "gmrc"
            "araling panlipunan" in value || value == "araling" || value == "panlipunan" -> "araling-panlipunan"
            value.startsWith("english") -> "english"
            value.startsWith("filipino") -> "filipino"
            value.startsWith("science") -> "science"
            listOf("mapeh", "music & arts", "music and arts", "physical education", "pe & health", "pe and health").any(value::contains) -> "mapeh"
            value == "epp" || value == "tle" || "technology and livelihood education" in value -> "epp-tle"
            value.startsWith("language") -> "language"
            else -> ""
        }
    }

    @DrawableRes
    private fun drawableFor(key: String): Int? = when (key) {
        "araling-panlipunan" -> R.drawable.araling_panlipunan
        "english" -> R.drawable.english
        "epp-tle" -> R.drawable.epp_tle
        "filipino" -> R.drawable.filipino
        "gmrc" -> R.drawable.gmrc
        "language" -> R.drawable.language
        "makabansa" -> R.drawable.makabansa
        "mapeh" -> R.drawable.mapeh
        "mathematics" -> R.drawable.mathematics
        "reading-literacy" -> R.drawable.reading_literacy
        "science" -> R.drawable.science
        "shs-arts-media-design" -> R.drawable.shs_arts_media_design
        "shs-business-entrepreneurship" -> R.drawable.shs_business_entrepreneurship
        "shs-language-communication" -> R.drawable.shs_language_communication
        "shs-mathematics" -> R.drawable.shs_mathematics
        "shs-physical-education-sports" -> R.drawable.shs_physical_education_sports
        "shs-research-immersion" -> R.drawable.shs_research_immersion
        "shs-science-technology" -> R.drawable.shs_science_technology
        "shs-social-sciences-humanities" -> R.drawable.shs_social_sciences_humanities
        "shs-technical-vocational" -> R.drawable.shs_technical_vocational
        "shs-values-personal-development" -> R.drawable.shs_values_personal_development
        else -> null
    }
}

@Composable
fun SubjectIcon(assignment: Assignment, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    val visual = SubjectVisuals.forAssignment(assignment)
    val iconModifier = modifier.size(size)
    if (visual.iconRes != null) {
        Image(
            painter = painterResource(visual.iconRes),
            contentDescription = "${assignment.subject} subject icon",
            modifier = iconModifier,
            contentScale = ContentScale.Fit,
        )
    } else {
        Icon(
            imageVector = Icons.Default.School,
            contentDescription = "${assignment.subject} subject icon",
            modifier = iconModifier,
            tint = visual.color,
        )
    }
}
