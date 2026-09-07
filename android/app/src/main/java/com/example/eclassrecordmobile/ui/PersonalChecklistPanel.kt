package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.PersonalChecklistRepository
import com.example.eclassrecordmobile.theme.NeonPurple
import com.example.eclassrecordmobile.ui.design.NeonCard

@Composable
fun PersonalChecklistPanel() {
    val context = LocalContext.current
    val repository = remember(context) { PersonalChecklistRepository(context) }
    var checklist by remember { mutableStateOf(repository.load()) }
    var category by rememberSaveable { mutableStateOf(checklist.categories.firstOrNull().orEmpty()) }
    var title by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NeonCard(modifier = Modifier.fillMaxWidth(), accent = NeonPurple.copy(alpha = 0.32f)) {
            Text("My Personal Checklist", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            Text(
                "Create your own items using retained categories. These stay encrypted on this Android device and are not part of the official desktop record.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            if (checklist.categories.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(checklist.categories, key = { it }) { saved ->
                        AssistChip(onClick = { category = saved }, label = { Text(saved) })
                    }
                }
            }
            OutlinedTextField(
                value = category,
                onValueChange = { category = it.take(80); error = "" },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Category") },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )
            OutlinedTextField(
                value = title,
                onValueChange = { title = it.take(180); error = "" },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Checklist item") },
                shape = RoundedCornerShape(16.dp),
            )
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            Button(
                onClick = {
                    runCatching { repository.add(category, title) }
                        .onSuccess {
                            checklist = it
                            category = it.categories.firstOrNull { saved ->
                                saved.equals(category.trim(), ignoreCase = true)
                            }.orEmpty()
                            title = ""
                        }
                        .onFailure { error = it.message ?: "Checklist item could not be saved." }
                },
                enabled = category.isNotBlank() && title.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Add checklist item")
            }
        }

        if (checklist.categories.isEmpty()) {
            NeonCard(modifier = Modifier.fillMaxWidth(), raised = true) {
                Text(
                    "Create your first category and checklist item.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        checklist.categories.forEach { savedCategory ->
            val categoryItems = checklist.items.filter { it.category == savedCategory }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(savedCategory, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                if (categoryItems.isEmpty()) {
                    Text("No items in this category.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                categoryItems.forEach { item ->
                    NeonCard(modifier = Modifier.fillMaxWidth(), raised = true, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = item.completed,
                                onCheckedChange = { checklist = repository.setCompleted(item.id, it) },
                            )
                            Text(
                                item.title,
                                modifier = Modifier.weight(1f),
                                fontWeight = FontWeight.SemiBold,
                                color = if (item.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                textDecoration = if (item.completed) TextDecoration.LineThrough else TextDecoration.None,
                            )
                            IconButton(onClick = { checklist = repository.delete(item.id) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete checklist item", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                HorizontalDivider()
            }
        }
    }
}
