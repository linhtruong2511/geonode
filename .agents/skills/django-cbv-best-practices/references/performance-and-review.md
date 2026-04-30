# Performance and Review Checklist

Use this checklist when reviewing or optimizing Django views.

## Security and correctness

- Does the view require authentication?
- Is access control enforced by `get_queryset()` or another trustworthy gate?
- Can a user guess another object's primary key and access or modify it?
- Are URL-scoped foreign keys enforced server-side in `form_valid()` or equivalent?
- Are state changes wrapped in a transaction when partial writes would be dangerous?

## Query performance

- Does the page trigger N+1 queries for related objects?
- Can `select_related()` remove repeated foreign-key lookups?
- Can `prefetch_related()` remove repeated reverse or many-to-many lookups?
- Are counts, sums, or booleans being computed per row instead of via `annotate()`, `Exists`, or `Subquery`?
- Is the list paginated?
- Is ordering indexed and intentional?
- Is the same object being fetched multiple times in the same request path?

## Maintainability

- Is the view doing business logic that belongs elsewhere?
- Is the same filtering or eager-loading logic repeated across multiple views?
- Would a queryset method, manager, selector, or mixin reduce duplication cleanly?
- Are method overrides short and easy to reason about?
- Are names clear enough that the next developer can see intent quickly?

## Common fixes

### Replace repeated object lookups

Bad:

```python
def get_context_data(self, **kwargs):
    context = super().get_context_data(**kwargs)
    context["project"] = Project.objects.get(pk=self.kwargs["pk"])
    return context


def form_valid(self, form):
    project = Project.objects.get(pk=self.kwargs["pk"])
    form.instance.project = project
    return super().form_valid(form)
```

Better:

```python
def dispatch(self, request, *args, **kwargs):
    self.project = get_object_or_404(
        Project.objects.visible_to(request.user),
        pk=kwargs["pk"],
    )
    return super().dispatch(request, *args, **kwargs)
```

### Move expensive related loading into the queryset

Bad:

```python
def get_context_data(self, **kwargs):
    context = super().get_context_data(**kwargs)
    context["tasks"] = self.object.task_set.all()
    return context
```

Better:

```python
def get_queryset(self):
    return Project.objects.visible_to(self.request.user).prefetch_related("task_set")
```

### Avoid trusting posted relationship data

Bad:

```python
def get_initial(self):
    return {"project": Project.objects.get(pk=self.kwargs["project_id"])}
```

Better:

```python
def form_valid(self, form):
    form.instance.project = self.project
    return super().form_valid(form)
```

## Review rubric for responses

When reviewing code, prioritize findings in this order:

1. access-control flaws
2. data-integrity risks
3. query inefficiencies
4. code-structure and readability issues

When rewriting code, preserve behavior unless the user asked for broader refactoring.
